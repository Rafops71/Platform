// Bilingual participant interface: the toggle, persistence, translated
// content, European date format, and the rule that the Operator dashboard
// stays in English.
//
// The last two tests are the ones that matter most. A translation layer that
// changes what a <select> *stores* as well as what it *shows* would silently
// write Spanish into the database, so "Bélgica" on screen must still save
// "Belgium". And the Operator dashboard must not pick up Spanish from a
// language the participant chose.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { query } = require('../../scripts/db');

let participant, operator;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  participant = await createAccount({ label: 'lang', role: 'participant', status: 'approved' });
  operator = await createAccount({ label: 'langop', role: 'operator', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

async function signIn(page, account, expectedPath) {
  await page.goto('/index.html');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('#login-btn');
  await page.waitForURL(`**/${expectedPath}`, { timeout: 20_000 });

  // waitForURL resolves on navigation, but the dashboard wires its handlers
  // and fills its dropdowns inside an async DOMContentLoaded callback, after
  // requireAuth() has awaited. Anything done in that window reads a page that
  // is not ready: a nav click hits an unwired button, a select reads back
  // empty. #user-name is set in the same synchronous block, before both, so a
  // non-empty name means the page is built.
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 20_000 });
}

test.describe.serial('bilingual participant interface', () => {

  test('sign-in page defaults to English and offers a language toggle', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#lang-toggle .lang-btn')).toHaveCount(2);
    await expect(page.locator('#login-btn')).toHaveText('Sign In');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('switching to Spanish translates the sign-in page in place', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#lang-toggle .lang-btn >> nth=1');

    await expect(page.locator('#login-btn')).toHaveText('Iniciar sesión');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('label[for="email"]')).toHaveText('Correo electrónico');
    await expect(page.locator('label[for="password"]')).toHaveText('Contraseña');
  });

  test('the choice survives navigation and a fresh page load', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#lang-toggle .lang-btn >> nth=1');
    await expect(page.locator('#login-btn')).toHaveText('Iniciar sesión');

    // A different page, then a reload — the language comes from localStorage,
    // so both must still be Spanish.
    await page.goto('/register.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.logo-row p')).toHaveText('Complete su registro');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.logo-row p')).toHaveText('Complete su registro');
  });

  test('the participant dashboard translates, including navigation and forms', async ({ page }) => {
    await signIn(page, participant, 'app.html');

    // Arrives in English (default) …
    await expect(page.locator('button[data-screen="my-listings"]')).toHaveText('My Listings');

    // … and switches without a reload.
    await page.click('#lang-toggle .lang-btn >> nth=1');
    await expect(page.locator('button[data-screen="my-listings"]')).toHaveText('Mis publicaciones');
    await expect(page.locator('button[data-screen="browse"]')).toHaveText('Explorar');
    await expect(page.locator('button[data-screen="mailbox"]')).toHaveText('Buzón');
    await expect(page.locator('#logout-link')).toHaveText('Cerrar sesión');

    await page.click('button[data-screen="new-listing"]');
    await expect(page.locator('label[for="specification"]')).toHaveText('Especificación / Grado');
    await expect(page.locator('label[for="notes"]')).toHaveText('Observaciones');
    await expect(page.locator('#listing-form legend')).toHaveText('Documentación disponible');
    await expect(page.locator('#doc-checklist')).toContainText('Certificado de análisis (COA)');
    await expect(page.locator('#doc-checklist')).toContainText('Documentación KYC');
  });

  test('translated dropdowns still store canonical English values', async ({ page }) => {
    await signIn(page, participant, 'app.html');
    await page.click('#lang-toggle .lang-btn >> nth=1');
    await page.click('button[data-screen="new-listing"]');

    // Shown in Spanish …
    await expect(page.locator('#location option[value="Belgium"]')).toHaveText('Bélgica');
    await expect(page.locator('#unit option[value="Metric tons"]')).toHaveText('Toneladas métricas');

    await page.check('input[name="type"][value="sell"]');
    await page.selectOption('#commodity-select', 'Antimony');
    await page.fill('#quantity', '750');
    await page.selectOption('#unit', 'Metric tons');
    await page.selectOption('#incoterm', 'FOB');
    await page.selectOption('#location', 'Belgium');
    await page.fill('#price_conditions', '1250');
    await page.selectOption('#currency', 'USD');
    await page.selectOption('#price_unit', 'Metric tons');
    await page.check('#doc-checklist input[value="Assay Report"]');
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select count(*)::int n from public.listings where user_id = (select id from public.profiles where email = $1)',
        [participant.email]
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    // … but stored in English, so the record is language-independent.
    const { rows } = await query(
      'select unit, origin, price_unit from public.listings where user_id = (select id from public.profiles where email = $1)',
      [participant.email]
    );
    expect(rows[0]).toMatchObject({ unit: 'Metric tons', origin: 'Belgium', price_unit: 'Metric tons' });

    const { rows: docs } = await query(
      `select doc_type from public.document_checklist
        where indicated = true
          and listing_id in (select id from public.listings where user_id = (select id from public.profiles where email = $1))`,
      [participant.email]
    );
    expect(docs.map(d => d.doc_type)).toContain('Assay Report');
  });

  test('dates render as DD/MM/YYYY in both languages', async ({ page }) => {
    await signIn(page, participant, 'app.html');
    const datePattern = /\b\d{2}\/\d{2}\/\d{4}\b/;

    await expect(page.locator('#my-listings-list')).toContainText(datePattern);

    await page.click('#lang-toggle .lang-btn >> nth=1');
    await expect(page.locator('#my-listings-list')).toContainText(datePattern);

    // And never the US order. The listing was created moments ago, so its
    // day and month are known — assert the rendered date matches today
    // written the European way.
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const expected = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
    await expect(page.locator('#my-listings-list')).toContainText(expected);
  });

  test('the Operator dashboard stays in English regardless of the choice', async ({ page }) => {
    // Choose Spanish as a participant first, so the preference is stored in
    // this browser profile before the operator signs in.
    await page.goto('/index.html');
    await page.click('#lang-toggle .lang-btn >> nth=1');
    await expect(page.locator('#login-btn')).toHaveText('Iniciar sesión');

    await signIn(page, operator, 'operator.html');

    await expect(page.locator('button[data-screen="approvals"]')).toContainText('Approvals');
    await expect(page.locator('button[data-screen="invitations"]')).toHaveText('Invitations');
    await expect(page.locator('#lang-toggle')).toHaveCount(0);

    const body = await page.locator('body').innerText();
    for (const spanish of ['Mis publicaciones', 'Cerrar sesión', 'Buzón', 'Explorar']) {
      expect(body, `operator dashboard leaked Spanish: "${spanish}"`).not.toContain(spanish);
    }
  });
});
