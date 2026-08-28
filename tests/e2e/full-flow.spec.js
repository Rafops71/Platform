// End-to-end: invite -> register -> approve -> listing -> browse -> contact
//                     -> forward -> reply, plus the anonymity guarantee.
//
// This is the flow that had been run by hand, one instruction at a time,
// across several sessions. Everything it touches is created and destroyed by
// tests/e2e/helpers/fixtures.js.
//
// The anonymity check is the reason this suite is worth having. Browsing is
// anonymous by design: a participant sees a listing's full commercial detail
// but never who posted it. Checking that by eye means reading a card and
// believing nothing is missing; here it is an assertion that the poster's
// name, company, email and phone appear nowhere in the rendered page.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { openScreen, signIn, signOut } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Distinctive so a match in the page can only have come from the profile —
// asserting that the string "Smith" is absent would fail the moment some
// unrelated word contained it.
const POSTER = {
  first_name: 'Zolthar',
  last_name: 'Quennemyre',
  company: 'Vexlibrium Trading BV',
  phone: '+32471999333',
};

const LISTING = {
  commodity: 'Antimony',
  quantity: '1200',
  unit: 'Metric tons',
  specification: 'Sb 99.65% ingot',
  incoterm: 'CIF',
  origin: 'Bolivia',
  price: '13850',
  priceUnit: 'Metric tons',
  currency: 'USD',
  notes: 'E2E automated flow check',
};

let operator, browser2, invitedEmail, invitedPassword, listingRef;

test.beforeAll(async () => {
  assertConfigured();
  // Any wreckage from an interrupted previous run.
  await cleanup();

  operator = await createAccount({ label: 'operator', role: 'operator', status: 'approved' });
  // A second approved participant: the listing has to be browsed and contacted
  // by someone who is not its author, since the poster is excluded from both
  // the anonymity question and the notification email.
  browser2 = await createAccount({ label: 'buyer', role: 'participant', status: 'approved' });
});

test.afterAll(async () => {
  await cleanup();
});

test.describe.serial('full participant lifecycle', () => {

  test('operator creates an invitation and it is emailed', async ({ page }) => {
    invitedEmail = `jericho-e2e-invited-${Date.now()}@example.invalid`;

    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'invitations');
    await page.fill('#invite-email', invitedEmail);
    await page.click('#create-invite-btn');

    const link = await page.locator('#invite-result code').innerText();
    expect(link).toContain('register.html?token=');

    // The invitation email is queued by queue_invitation_email(), which is
    // operator-guarded — so this also proves the RPC accepted a real operator
    // session, not just that a row appeared.
    const { rows } = await query(
      'select subject, body_text from public.email_outbox where to_email = $1',
      [invitedEmail]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].body_text).toContain('register.html?token=');

    test.info().annotations.push({ type: 'invitation', description: link });
    process.env.E2E_INVITE_LINK = link;
  });

  test('invited person registers through the invitation link', async ({ page }) => {
    const link = process.env.E2E_INVITE_LINK;
    invitedPassword = 'Pw-e2e-invited-1';

    await page.goto(link);
    await expect(page.locator('#register-card')).toBeVisible();

    await page.fill('#first_name', POSTER.first_name);
    await page.fill('#last_name', POSTER.last_name);
    await page.fill('#company', POSTER.company);
    await page.fill('#email', invitedEmail);
    await page.fill('#password', invitedPassword);
    await page.selectOption('#country', 'Belgium');
    await page.fill('#phone', POSTER.phone);
    // Required since sql/010. Without it the browser refuses to submit, and
    // this test would fail on the navigation rather than on anything to do
    // with registration. tests/e2e/terms.spec.js covers the refusal itself.
    await page.check('#accept-terms');
    await page.click('#register-btn');

    await page.waitForURL('**/index.html**', { timeout: 20_000 });

    const { rows } = await query('select status, role from public.profiles where email = $1', [invitedEmail]);
    expect(rows[0]).toMatchObject({ status: 'pending', role: 'participant' });

    // Registration confirmation email (trg_email_registration_submitted).
    const { rows: mail } = await query(
      "select subject from public.email_outbox where to_email = $1 and subject like '%submitted%'",
      [invitedEmail]
    );
    expect(mail).toHaveLength(1);
  });

  test('a pending participant cannot sign in', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#email', invitedEmail);
    await page.fill('#password', invitedPassword);
    await page.click('#login-btn');
    // requireAuth() bounces a pending profile back with ?pending=1 rather than
    // letting it reach the app.
    await page.waitForURL('**/index.html?pending=1', { timeout: 20_000 });
  });

  test('operator approves the registration', async ({ page }) => {
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'approvals');

    const { rows } = await query('select id from public.profiles where email = $1', [invitedEmail]);
    await page.click(`[data-approve="${rows[0].id}"]`);

    await expect.poll(async () => {
      const r = await query('select status from public.profiles where email = $1', [invitedEmail]);
      return r.rows[0].status;
    }, { timeout: 15_000 }).toBe('approved');

    const { rows: mail } = await query(
      "select subject from public.email_outbox where to_email = $1 and subject like '%approved%'",
      [invitedEmail]
    );
    expect(mail.length).toBeGreaterThanOrEqual(1);
  });

  test('approved participant posts a listing', async ({ page }) => {
    await signIn(page, { email: invitedEmail, password: invitedPassword }, 'app.html');
    await openScreen(page, 'new-listing');

    await page.check('input[name="type"][value="sell"]');
    await page.selectOption('#commodity-select', LISTING.commodity);
    await page.fill('#quantity', LISTING.quantity);
    await page.selectOption('#unit', LISTING.unit);
    await page.fill('#specification', LISTING.specification);
    await page.selectOption('#incoterm', LISTING.incoterm);
    await page.selectOption('#location', LISTING.origin);
    await page.fill('#price_conditions', LISTING.price);
    await page.selectOption('#currency', LISTING.currency);
    await page.selectOption('#price_unit', LISTING.priceUnit);
    await page.fill('#notes', LISTING.notes);

    // One document from each of the two checklist groups.
    await page.check('#doc-checklist input[value="Certificate of Analysis (COA)"]');
    await page.check('#doc-checklist input[value="KYC Documentation"]');

    await page.click('#listing-submit-btn');

    await expect.poll(async () => {
      const r = await query(
        'select reference_number from public.listings where user_id = (select id from public.profiles where email = $1)',
        [invitedEmail]
      );
      return r.rows.length;
    }, { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      'select reference_number, price_unit, unit, origin from public.listings where user_id = (select id from public.profiles where email = $1)',
      [invitedEmail]
    );
    listingRef = rows[0].reference_number;
    // The dropdowns must persist their value, not a blank.
    expect(rows[0]).toMatchObject({
      unit: LISTING.unit,
      origin: LISTING.origin,
      price_unit: LISTING.priceUnit,
    });
  });

  test('browse shows full detail but never the poster identity', async ({ page }) => {
    await signIn(page, browser2, 'app.html');
    await openScreen(page, 'browse');

    const card = page.locator('.list-row', { hasText: listingRef });
    await expect(card).toBeVisible();

    // Every commercial field is public to an approved participant.
    await expect(card).toContainText(LISTING.commodity);
    await expect(card).toContainText(LISTING.specification);
    // Numbers are rendered in the active locale, so 13850 shows as 13,850 in
    // English (and 13.850 in Spanish). Assert what the participant actually
    // sees rather than the raw stored string.
    await expect(card).toContainText(new Intl.NumberFormat('en-GB').format(Number(LISTING.price)));
    await expect(card).toContainText(LISTING.priceUnit);
    await expect(card).toContainText(LISTING.notes);
    await expect(card).toContainText(LISTING.origin);
    await expect(card).toContainText(LISTING.incoterm);

    // The identity is not. Checked against the whole rendered page, not just
    // the card, so a leak anywhere on the screen still fails.
    const body = await page.locator('body').innerText();
    for (const secret of [POSTER.first_name, POSTER.last_name, POSTER.company, POSTER.phone, invitedEmail]) {
      expect(body, `browse leaked "${secret}"`).not.toContain(secret);
    }

    // Belt and braces: the RPC itself must not even return an identity column.
    const { rows } = await query('select * from public.get_public_listings() limit 1');
    const columns = Object.keys(rows[0] || {});
    for (const forbidden of ['user_id', 'email', 'first_name', 'last_name', 'company', 'phone']) {
      expect(columns, `get_public_listings exposes ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('participant contacts the listing, operator forwards, owner receives', async ({ page }) => {
    const messageText = 'E2E enquiry: is the Sb assay certificate available?';

    await signIn(page, browser2, 'app.html');
    await openScreen(page, 'browse');
    await page.locator('.list-row', { hasText: listingRef }).locator('[data-contact]').click();
    await page.fill('#contact-body', messageText);
    await page.click('#contact-send-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.messages where body = $1', [messageText]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
    await signOut(page);

    // Operator forwards it to the listing owner.
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'mailbox');

    const { rows: msg } = await query('select id from public.messages where body = $1', [messageText]);
    await page.click(`[data-forward="${msg[0].id}"]`);
    await page.click('#forward-confirm-btn');

    await expect.poll(async () => {
      const r = await query('select count(*)::int n from public.message_forward_log where message_id = $1', [msg[0].id]);
      return r.rows[0].n;
    }, { timeout: 20_000 }).toBe(1);
    await signOut(page);

    // The owner must actually see it. This is the leg that a real bug once
    // broke — messages_select correlated on the wrong id, so forwarded
    // messages silently never arrived.
    await signIn(page, { email: invitedEmail, password: invitedPassword }, 'app.html');
    await openScreen(page, 'mailbox');
    await expect(page.locator('#mailbox-list')).toContainText(messageText, { timeout: 15_000 });

    // And the enquirer's identity is not disclosed to the owner either.
    const mailbox = await page.locator('#mailbox-list').innerText();
    expect(mailbox).not.toContain(browser2.email);
  });
});
