// Terms & Conditions: reading them, being required to accept them, and the
// record that acceptance leaves behind.
//
// The checkbox is the part a person experiences and the acceptance row is the
// part that matters afterwards, so both are asserted here - that registration
// genuinely cannot proceed without ticking the box, and that what gets stored
// is the version and the language actually shown on screen rather than a
// default filled in somewhere later.
//
// The terms page itself loads no Supabase client and needs no session: someone
// has to be able to read the terms before they have an account. That is worth
// keeping true, so one test opens it cold.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured, testEmail, testPassword } = require('./helpers/fixtures');
const { query } = require('../../scripts/db');

// Read from the source rather than restating it, so that bumping
// TERMS_VERSION without updating this file cannot quietly pass.
const TERMS_VERSION = fs
  .readFileSync(path.join(__dirname, '..', '..', 'js', 'utils.js'), 'utf8')
  .match(/const TERMS_VERSION = '([^']+)'/)[1];

// A sentence from each language, distinctive enough that finding it proves the
// right text rendered and not merely that something did.
const EN_MARKER = 'The Platform is not an exchange';
const ES_MARKER = 'La Plataforma no es un mercado organizado';

let approved, operator;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  // The operator exists only to own the invitations below - invitations.created_by
  // is not nullable, and an invitation nobody issued is not a real one anyway.
  operator = await createAccount({ label: 'termsop', role: 'operator', status: 'approved' });
  approved = await createAccount({ label: 'terms', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

/** An invitation straight into the table, so this spec does not depend on the
 *  operator UI to produce one. cleanup() removes it by its prefixed email. */
async function createInvitation(language) {
  const email = testEmail('terms-invite');
  const token = `jericho-e2e-terms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `insert into public.invitations (token, email, created_by, expires_at, language)
     values ($1, $2, $3, now() + interval '5 days', $4)`,
    [token, email, operator.profileId, language]
  );
  return { email, token, link: `/register.html?token=${token}` };
}

test.describe.serial('Terms & Conditions', () => {

  test('the terms can be read without an account, in English', async ({ page }) => {
    await page.goto('/terms.html');

    await expect(page.locator('#terms-heading'))
      .toHaveText('Terms & Conditions, Disclaimer and Privacy Notice');
    await expect(page.locator('#terms-version')).toHaveText(`Version ${TERMS_VERSION}`);

    // All sixteen sections rendered, not just the first.
    await expect(page.locator('#terms-body .terms-section')).toHaveCount(16);

    const body = await page.locator('#terms-body').innerText();
    expect(body).toContain(EN_MARKER);
    // The protections that must not quietly disappear from the text.
    expect(body).toContain('do not verify, endorse, or guarantee');
    expect(body).toContain('solely responsible for your own due diligence');
    expect(body).toContain('must not attempt to identify');
    expect(body).toContain('To the fullest extent permitted by law');
    expect(body).toContain('at their sole discretion');

    // The commercially load-bearing clauses. These are the reason the terms
    // exist at all, so each is asserted by its operative words rather than by
    // the section merely being present.
    expect(body).toContain('It is not a public marketplace');
    expect(body).toContain('may be suspended or revoked at any time without notice');
    expect(body).toContain('entitled to the commission agreed between the parties during negotiation');
    expect(body).toContain('twenty-four (24) months from the date the introduction is made');
    expect(body).toContain('governed by English law');
    expect(body).toContain('exclusive jurisdiction of the courts of England and Wales');
  });

  test('the Privacy Notice renders in full', async ({ page }) => {
    await page.goto('/terms.html');

    // Section 10 is the one section with several paragraphs rather than one,
    // so a broken TERMS_SECTION_PARAGRAPHS would silently render a single
    // paragraph and lose the rest. Count them, then check each covers what it
    // is supposed to cover.
    const privacy = page.locator('#terms-body .terms-section').nth(9);
    await expect(privacy.locator('h3')).toHaveText('10. Privacy Notice');
    await expect(privacy.locator('p')).toHaveCount(9);

    const text = await privacy.innerText();
    expect(text).toContain('What is collected');
    expect(text).toContain('language preference');
    expect(text).toContain('Why it is collected');
    expect(text).toContain('audit trail');
    expect(text).toContain('visible only to the Operators');
    expect(text).toContain("Participants never see one another's identity");
    expect(text).toContain('not sold, rented, or traded');
    expect(text).toContain('How long it is kept');
    expect(text).toContain('Operator access');
    expect(text).toContain('brokerage and of security');
    // The controller and the complaints route are the two privacy details that
    // depend on a company existing, so both are present and both are marked.
    expect(text).toContain('Data controller');
    expect(text).toContain('data controller legal name');
    expect(text).toContain('Complaints');
    expect(text).toContain('competent data protection supervisory authority');
  });

  test('switching to Spanish translates the terms in place', async ({ page }) => {
    await page.goto('/terms.html');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();

    await expect(page.locator('#terms-heading'))
      .toHaveText('Términos y Condiciones, Exención de Responsabilidad y Aviso de Privacidad');
    await expect(page.locator('#terms-body .terms-section')).toHaveCount(16);

    const body = await page.locator('#terms-body').innerText();
    expect(body).toContain(ES_MARKER);
    expect(body).toContain('diligencia debida');
    expect(body).toContain('En la máxima medida permitida por la ley');

    // The same load-bearing clauses, in the language they will actually be
    // read and relied on in.
    expect(body).toContain('No es un mercado público');
    expect(body).toContain('podrá suspenderse o revocarse en cualquier momento sin previo aviso');
    expect(body).toContain('la comisión acordada entre las partes durante la negociación');
    expect(body).toContain('veinticuatro (24) meses');
    expect(body).toContain('se rigen por el Derecho inglés');
    expect(body).toContain('jurisdicción exclusiva de los tribunales de Inglaterra y Gales');

    // The Privacy Notice is translated too, not left in English.
    expect(body).toContain('Aviso de Privacidad');
    expect(body).toContain('Datos que se recogen');
    expect(body).toContain('nunca conocen la identidad de los demás');

    // And no English left behind on a page claiming to be Spanish.
    expect(body).not.toContain(EN_MARKER);
    expect(body).not.toContain('Terms & Conditions, Disclaimer and Privacy Notice');
    expect(body).not.toContain('governed by English law');
  });

  // The Terms name a governing law and claim a commission, but the company
  // claiming them does not exist on paper yet. Every detail that is missing is
  // written into the document as a marked placeholder rather than omitted, and
  // the failure worth catching is one of them quietly losing its marking - a
  // bracket filled in with something invented reads as finished when it is not.
  test('every missing legal detail is rendered and marked as a placeholder', async ({ page }) => {
    await page.goto('/terms.html');

    const notice = page.locator('#terms-placeholder-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('THIS DOCUMENT IS NOT YET COMPLETE');

    const company = page.locator('#terms-body .terms-section').nth(15);
    await expect(company.locator('h3')).toHaveText('16. The Operators: company details and notices');
    await expect(company.locator('p')).toHaveCount(6);

    const text = await company.innerText();
    expect(text).toContain('operating company legal name');
    expect(text).toContain('country of incorporation');
    expect(text).toContain('company registration number');
    expect(text).toContain('registered office address');
    expect(text).toContain('trading address');
    expect(text).toContain('VAT or tax registration number');
    expect(text).toContain('legal notices email address');
    expect(text).toContain('reviewed by a qualified lawyer');

    // Nothing bracketed anywhere in the terms may be unmarked. This is the
    // assertion that fails if someone fills a bracket with a working guess.
    const body = await page.locator('#terms-body').innerText();
    const bracketed = body.split('[').slice(1).map((part) => part.split(']')[0]);
    expect(bracketed.length).toBeGreaterThanOrEqual(11);
    for (const item of bracketed) expect(item).toContain('PLACEHOLDER');
  });

  test('the placeholders are marked in Spanish too', async ({ page }) => {
    await page.goto('/terms.html');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();

    await expect(page.locator('#terms-placeholder-notice'))
      .toContainText('ESTE DOCUMENTO AÚN NO ESTÁ COMPLETO');

    const company = page.locator('#terms-body .terms-section').nth(15);
    await expect(company.locator('h3'))
      .toHaveText('16. Los Operadores: datos de la sociedad y notificaciones');

    const text = await company.innerText();
    expect(text).toContain('razón social de la empresa operadora');
    expect(text).toContain('domicilio social');
    expect(text).toContain('número de registro mercantil');
    expect(text).toContain('ser revisados por un abogado');
    expect(text).not.toContain('operating company legal name');

    const body = await page.locator('#terms-body').innerText();
    const bracketed = body.split('[').slice(1).map((part) => part.split(']')[0]);
    expect(bracketed.length).toBeGreaterThanOrEqual(11);
    for (const item of bracketed) expect(item).toContain('PLACEHOLDER');
  });

  test('the registration page requires acceptance and links to the terms', async ({ page }) => {
    const invite = await createInvitation('en');
    await page.goto(invite.link);
    await expect(page.locator('#register-card')).toBeVisible();

    const box = page.locator('#accept-terms');
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();

    const link = page.locator('#terms-link');
    await expect(link).toHaveAttribute('href', 'terms.html');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('registration is refused while the box is unticked', async ({ page }) => {
    const invite = await createInvitation('en');
    await page.goto(invite.link);
    await expect(page.locator('#register-card')).toBeVisible();

    const password = testPassword();
    await page.fill('#first_name', 'Unticked');
    await page.fill('#last_name', 'Refused');
    await page.fill('#email', invite.email);
    await page.fill('#password', password);
    await page.selectOption('#country', 'Belgium');
    await page.fill('#phone', '+3200000009');

    await page.click('#register-btn');

    // The browser refuses to submit an unchecked required box, so the page
    // never navigates and no account comes into existence. Both are asserted:
    // staying put could be any kind of failure, but no profile is the point.
    await expect(page.locator('#accept-terms')).toBeVisible();
    expect(page.url()).toContain('register.html');
    await expect(page.locator('#accept-terms')).toHaveJSProperty('validity.valid', false);

    const { rows } = await query('select count(*)::int n from public.profiles where email = $1', [invite.email]);
    expect(rows[0].n, 'an account was created without accepting the terms').toBe(0);
  });

  test('ticking the box registers, and the acceptance is recorded', async ({ page }) => {
    const invite = await createInvitation('en');
    await page.goto(invite.link);
    await expect(page.locator('#register-card')).toBeVisible();

    await page.fill('#first_name', 'Ticked');
    await page.fill('#last_name', 'Accepted');
    await page.fill('#email', invite.email);
    await page.fill('#password', testPassword());
    await page.selectOption('#country', 'Belgium');
    await page.fill('#phone', '+3200000010');
    await page.check('#accept-terms');

    await page.click('#register-btn');
    await page.waitForURL('**/index.html**', { timeout: 20_000 });

    const { rows } = await query(
      `select a.version, a.language, a.accepted_at is not null as stamped
         from public.terms_acceptances a
         join public.profiles p on p.id = a.profile_id
        where p.email = $1`,
      [invite.email]
    );
    expect(rows, 'no acceptance was recorded for a completed registration').toHaveLength(1);
    expect(rows[0].version).toBe(TERMS_VERSION);
    expect(rows[0].language).toBe('en');
    expect(rows[0].stamped).toBe(true);
  });

  test('a Spanish registration records Spanish as the accepted language', async ({ page }) => {
    const invite = await createInvitation('es');
    await page.goto(invite.link);
    await expect(page.locator('#register-card')).toBeVisible();

    // Switch the interface before accepting: the language recorded must be the
    // one the terms were actually read in, not the invitation's.
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(page.locator('#accept-terms')).toBeVisible();

    await page.fill('#first_name', 'Espanol');
    await page.fill('#last_name', 'Aceptado');
    await page.fill('#email', invite.email);
    await page.fill('#password', testPassword());
    await page.selectOption('#country', 'Spain');
    await page.fill('#phone', '+3400000011');
    await page.check('#accept-terms');

    await page.click('#register-btn');
    await page.waitForURL('**/index.html**', { timeout: 20_000 });

    const { rows } = await query(
      `select a.version, a.language
         from public.terms_acceptances a
         join public.profiles p on p.id = a.profile_id
        where p.email = $1`,
      [invite.email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].language).toBe('es');
    expect(rows[0].version).toBe(TERMS_VERSION);
  });

  test('an approved participant can reach the terms again from the dashboard', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#email', approved.email);
    await page.fill('#password', approved.password);
    await page.click('#login-btn');
    await page.waitForURL('**/app.html', { timeout: 20_000 });
    await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 20_000 });

    const link = page.locator('#footer-terms-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'terms.html');
    await expect(link).toHaveText('Terms & Conditions');
  });
});
