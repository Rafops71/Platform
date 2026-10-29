// What a poster says about their own listing (sql/033, docs/AGREED items
// 16-22): the role questions on the form, the owner's two-degrees rule, and
// what Browse and the Operator console each show of the answers.
//
// The database half - every refusal, the server's clock on the tick - is in
// sql/tests/20. This is the half a member actually meets.

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, openScreen, submitListing, pickCommodity } = require('./helpers/session');
const { query } = require('../../scripts/db');

const OFFER = { commodity: 'Iron Ore', quantity: '310', unit: 'Metric tons', incoterm: 'FOB', origin: 'Chile' };

let poster, reader, operator;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  operator = await createAccount({ label: 'stmtop', role: 'operator', status: 'approved' });
  poster   = await createAccount({ label: 'stmtposter', role: 'participant', status: 'approved' });
  reader   = await createAccount({ label: 'stmtreader', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

async function fillOffer(page) {
  await openScreen(page, 'new-listing');
  await page.check('input[name="type"][value="sell"]');
  await pickCommodity(page, OFFER.commodity);
  await page.fill('#quantity', OFFER.quantity);
  await page.selectOption('#unit', OFFER.unit);
  await page.selectOption('#incoterm', OFFER.incoterm);
  await page.selectOption('#location', OFFER.origin);
}

async function postedBy(account) {
  const { rows } = await query(
    `select count(*)::int n from public.listings
      where user_id = (select id from public.profiles where email = $1)`, [account.email]);
  return rows[0].n;
}

test.describe.serial('listing statements', () => {

  test('Item67 an offer more than two steps from the principal is refused on the form', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.check('#role-broker');
    await page.selectOption('#broker_via', 'further');
    await page.selectOption('#docs_seen', 'no');
    await page.selectOption('#docs_showable', 'no');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');

    await expect(page.locator('.toast-error').last()).toContainText(
      'MyPlatform accepts offers no more than two steps from the principal. Please post only offers within that distance.');
    expect(await postedBy(poster), 'a listing was saved beyond the two-step limit').toBe(0);
  });

  test('Item66 the form will not publish without the truth box ticked', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.check('#role-principal');
    await page.selectOption('#docs_seen', 'yes');
    await page.selectOption('#docs_showable', 'on_request');
    await page.click('#listing-submit-btn');

    await expect(page.locator('.toast-error').last()).toContainText('Please confirm that this offer is true');
    expect(await postedBy(poster)).toBe(0);
  });

  test('Item68 Browse shows the role and documents line; only the Operator sees the chain', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.check('#role-broker');
    await page.selectOption('#broker_via', 'one_broker');
    await page.selectOption('#docs_seen', 'source_says');
    await page.selectOption('#docs_showable', 'after_agreement');
    await submitListing(page);
    await expect.poll(() => postedBy(poster), { timeout: 20_000 }).toBe(1);

    const { rows } = await query(
      `select id, reference_number, truth_confirmed_at from public.listings
        where user_id = (select id from public.profiles where email = $1)`, [poster.email]);
    const listing = rows[0];
    expect(listing.truth_confirmed_at, 'the tick was not stamped').not.toBeNull();
    await signOut(page);

    await signIn(page, reader, 'app.html');
    await openScreen(page, 'browse');
    const row = page.locator('.list-row', { hasText: listing.reference_number });
    await expect(row.locator('[data-statements]')).toHaveText(
      "Poster: Broker · Documents: Not seen; the poster's source says they exist", { timeout: 15_000 });
    await expect(row).not.toContainText('other broker');
    await signOut(page);

    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');
    await expect(page.locator(`[data-poster-for="${listing.id}"]`))
      .toContainText('Broker · via one other broker', { timeout: 15_000 });
  });

  test('Item66 a principal on a Sell offer must say Producer or Trader; a Buy request is never asked', async ({ page }) => {
    const before = await postedBy(poster);
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.check('#role-principal');
    await expect(page.locator('#kind-row')).toBeVisible();
    await page.selectOption('#docs_seen', 'yes');
    await page.selectOption('#docs_showable', 'on_request');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');
    await expect(page.locator('.toast-error').last()).toContainText('Please say whether you are a producer or a trader.');
    expect(await postedBy(poster), 'a Sell offer was saved with no Producer or Trader answer').toBe(before);

    await page.check('#kind-trader');
    await submitListing(page);
    await expect.poll(() => postedBy(poster), { timeout: 20_000 }).toBe(before + 1);
    const { rows } = await query(
      `select reference_number, principal_kind from public.listings
        where user_id = (select id from public.profiles where email = $1)
        order by created_at desc limit 1`, [poster.email]);
    expect(rows[0].principal_kind).toBe('trader');
    const sellRef = rows[0].reference_number;

    await openScreen(page, 'new-listing');
    await page.check('input[name="type"][value="buy"]');
    await page.check('#role-principal');
    await expect(page.locator('#kind-row'), 'Buy requests must not ask Producer or Trader').toBeHidden();
    await page.check('input[name="type"][value="sell"]');
    await expect(page.locator('#kind-row')).toBeVisible();
    await page.check('input[name="type"][value="buy"]');
    await pickCommodity(page, OFFER.commodity);
    await page.fill('#quantity', OFFER.quantity);
    await page.selectOption('#unit', OFFER.unit);
    await page.selectOption('#incoterm', OFFER.incoterm);
    await page.selectOption('#location', OFFER.origin);
    await page.selectOption('#docs_seen', 'yes');
    await page.selectOption('#docs_showable', 'on_request');
    await page.check('#truth-confirm');
    await submitListing(page);
    await expect.poll(() => postedBy(poster), { timeout: 20_000 }).toBe(before + 2);
    const { rows: buy } = await query(
      `select reference_number, principal_kind from public.listings
        where user_id = (select id from public.profiles where email = $1)
        order by created_at desc limit 1`, [poster.email]);
    expect(buy[0].principal_kind, 'a Buy request carries no Producer or Trader').toBeNull();
    await signOut(page);

    await signIn(page, reader, 'app.html');
    await openScreen(page, 'browse');
    await expect(page.locator('.list-row', { hasText: sellRef }).locator('[data-statements]'))
      .toHaveText('Poster: Principal (Trader) · Documents: Seen by the poster', { timeout: 15_000 });
    await expect(page.locator('.list-row', { hasText: buy[0].reference_number }).locator('[data-statements]'))
      .toHaveText('Poster: Principal · Documents: Seen by the poster', { timeout: 15_000 });
  });
});
