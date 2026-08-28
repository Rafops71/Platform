// Language-aware notification emails, driven through the real UI.
//
// sql/tests/02_email_language.sql already proves the database composes the
// right words once profiles.language says 'es'. What it cannot prove is that
// the browser ever PUTS 'es' there — that path runs through the EN/ES toggle
// in js/app.js and the signUp metadata in js/auth.js. This spec covers the
// join between the two: toggle the interface, then read what the trigger
// actually queued.
//
// Nothing is sent. These are email_outbox rows; scripts/send-listing-emails.js
// is never invoked, and teardown deletes the rows.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { openScreen, signIn } = require('./helpers/session');
const { query } = require('../../scripts/db');

const LISTING = {
  commodity: 'Antimony',
  quantity: '640',
  unit: 'Metric tons',
  specification: 'Sb 99.65% ingot',
  incoterm: 'FOB',
  origin: 'Peru',
};

let operator, poster, hablante, speaker, listingRef;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  // The operator deliberately gets language 'es' on their profile further
  // down, to prove operator mail ignores it.
  operator = await createAccount({ label: 'lgop', role: 'operator', status: 'approved' });
  poster   = await createAccount({ label: 'lgpost', role: 'participant', status: 'approved' });
  hablante = await createAccount({ label: 'lges', role: 'participant', status: 'approved' });
  speaker  = await createAccount({ label: 'lgen', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

async function languageOf(email) {
  const { rows } = await query('select language from public.profiles where email = $1', [email]);
  return rows[0] && rows[0].language;
}

/** The one outbox row for this recipient about this listing. */
async function listingMail(email) {
  const { rows } = await query(
    `select subject, body_text from public.email_outbox
      where to_email = $1 and related_listing_id =
            (select id from public.listings where reference_number = $2)`,
    [email, listingRef]
  );
  return rows[0];
}

test.describe.serial('notification emails follow the recipient language', () => {

  test('everyone starts in English', async () => {
    expect(await languageOf(hablante.email)).toBe('en');
    expect(await languageOf(speaker.email)).toBe('en');
  });

  test('using the ES toggle stores the choice on the profile', async ({ page }) => {
    await signIn(page, hablante, 'app.html');
    await page.click('#lang-toggle .lang-btn >> nth=1');
    // The interface really did switch …
    await expect(page.locator('button[data-screen="new-listing"]')).toContainText('Nueva');

    // … and the choice reached the database, which is the part that decides
    // what language their email gets composed in. Written fire-and-forget, so
    // poll rather than assuming it landed before the click returned.
    await expect.poll(() => languageOf(hablante.email), { timeout: 15_000 }).toBe('es');
  });

  test('an operator can have a Spanish preference on their profile', async () => {
    // Written directly: operator.html has no toggle by design (it is the one
    // page that never loads js/i18n.js), so there is no UI path to set this.
    // The row is what trg_queue_listing_emails() reads, and the point of the
    // next-but-one test is that it reads it and overrides it.
    await query('update public.profiles set language = $2 where email = $1', [operator.email, 'es']);
    expect(await languageOf(operator.email)).toBe('es');
  });

  test('a new listing emails each member in their own language', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await openScreen(page, 'new-listing');

    await page.check('input[name="type"][value="sell"]');
    await page.selectOption('#commodity-select', LISTING.commodity);
    await page.fill('#quantity', LISTING.quantity);
    await page.selectOption('#unit', LISTING.unit);
    await page.fill('#specification', LISTING.specification);
    await page.selectOption('#incoterm', LISTING.incoterm);
    await page.selectOption('#location', LISTING.origin);
    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select count(*)::int n from public.listings where user_id = (select id from public.profiles where email = $1)',
        [poster.email]
      );
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      'select reference_number from public.listings where user_id = (select id from public.profiles where email = $1)',
      [poster.email]
    );
    listingRef = rows[0].reference_number;
  });

  test('the Spanish participant receives a Spanish email', async () => {
    const mail = await listingMail(hablante.email);
    expect(mail, 'no email was queued for the Spanish participant').toBeTruthy();

    expect(mail.subject).toMatch(/^Nueva Oferta de venta — Antimony \(/);
    expect(mail.body_text).toContain('Se ha publicado una nueva Oferta de venta');
    expect(mail.body_text).toContain('Materia prima: Antimony');
    expect(mail.body_text).toContain('Especificación / grado');
    expect(mail.body_text).toContain('Origen: Peru');
    expect(mail.body_text).toContain('Toneladas métricas');
    expect(mail.body_text).toContain('buzón');

    // No English label left stranded in the middle of it.
    for (const english of ['Commodity:', 'Quantity:', 'Specification:', 'Origin:', 'Notes:', 'anonymously']) {
      expect(mail.body_text, `Spanish email still contains "${english}"`).not.toContain(english);
    }
  });

  test('the English participant receives an English email', async () => {
    const mail = await listingMail(speaker.email);
    expect(mail, 'no email was queued for the English participant').toBeTruthy();

    expect(mail.subject).toMatch(/^New Sell Offer — Antimony \(/);
    expect(mail.body_text).toContain('Commodity: Antimony');
    expect(mail.body_text).toContain('Origin: Peru');
    expect(mail.body_text).toContain('Metric tons');
    for (const spanish of ['Materia prima', 'Origen:', 'Observaciones', 'buzón']) {
      expect(mail.body_text, `English email contains "${spanish}"`).not.toContain(spanish);
    }
  });

  test('the operator receives English despite preferring Spanish', async () => {
    expect(await languageOf(operator.email)).toBe('es');

    const mail = await listingMail(operator.email);
    expect(mail, 'no email was queued for the operator').toBeTruthy();
    expect(mail.subject).toMatch(/^New Sell Offer — Antimony \(/);
    expect(mail.body_text).toContain('Commodity: Antimony');
    expect(mail.body_text).not.toContain('Materia prima');
  });

  test('the poster is not emailed about their own listing', async () => {
    expect(await listingMail(poster.email)).toBeUndefined();
  });

  test('the operator can send an invitation in Spanish', async ({ page }) => {
    const invited = `jericho-e2e-invited-es-${Date.now()}@example.invalid`;

    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'invitations');
    await page.fill('#invite-email', invited);
    await page.selectOption('#invite-language', 'es');
    await page.click('#create-invite-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.email_outbox where to_email = $1', [invited]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      'select subject, body_text from public.email_outbox where to_email = $1', [invited]
    );
    expect(rows[0].subject).toBe('Le han invitado a la Plataforma Jericho');
    expect(rows[0].body_text).toContain('Utilice este enlace para crear su cuenta');
    expect(rows[0].body_text).toContain('register.html?token=');

    // And it was recorded against the invitation itself, so the choice is not
    // lost the moment the email is queued.
    const { rows: inv } = await query('select language from public.invitations where email = $1', [invited]);
    expect(inv[0].language).toBe('es');

    // The operator dashboard itself stays English throughout.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Invitaciones');
    expect(body).toContain('Create Invitation');
  });

  test('nothing in this spec was actually sent', async () => {
    const { rows } = await query(
      'select count(*)::int n from public.email_outbox where sent_at is not null and to_email like $1',
      ['jericho-e2e-%']
    );
    expect(rows[0].n).toBe(0);
  });
});
