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
    await page.selectOption('#poster_role', 'broker');
    await page.selectOption('#broker_via', 'further');
    await page.selectOption('#docs_seen', 'no');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');

    await expect(page.locator('.toast-error').last()).toContainText(
      'MyPlatform accepts offers no more than two steps from the principal. Please post only offers within that distance.');
    expect(await postedBy(poster), 'a listing was saved beyond the two-step limit').toBe(0);
  });

  test('Item66 the form will not publish without the truth box ticked', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.selectOption('#poster_role', 'principal');
    // A principal's Sell offer also answers Producer or Trader (sql/043); the
    // question under test here is the missing truth tick, so answer that one.
    await page.selectOption('#principal_kind', 'producer');
    await page.selectOption('#docs_seen', 'yes');
    await page.click('#listing-submit-btn');

    await expect(page.locator('.toast-error').last()).toContainText('Please confirm that this offer is true');
    expect(await postedBy(poster)).toBe(0);
  });

  test('Item68 Browse shows the role and documents line; only the Operator sees the chain', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    await fillOffer(page);
    await page.selectOption('#poster_role', 'broker');
    await page.selectOption('#broker_via', 'one_broker');
    await page.selectOption('#docs_seen', 'source_says');
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
    // The one date the poster's statements were confirmed (sql/064): fresh, so "Stated by".
    await expect(row.locator('[data-statements-date]')).toHaveText(/^Stated by the poster on \d{2}\/\d{2}\/\d{4}$/);
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
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#kind-row')).toBeVisible();
    await page.selectOption('#docs_seen', 'yes');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');
    await expect(page.locator('.toast-error').last()).toContainText('Please say whether you are a producer or a trader.');
    expect(await postedBy(poster), 'a Sell offer was saved with no Producer or Trader answer').toBe(before);

    await page.selectOption('#principal_kind', 'trader');
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
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#kind-row'), 'Buy requests must not ask Producer or Trader').toBeHidden();
    await page.check('input[name="type"][value="sell"]');
    await expect(page.locator('#kind-row')).toBeVisible();
    await page.check('input[name="type"][value="buy"]');
    await pickCommodity(page, OFFER.commodity);
    await page.fill('#quantity', OFFER.quantity);
    await page.selectOption('#unit', OFFER.unit);
    await page.selectOption('#incoterm', OFFER.incoterm);
    await page.selectOption('#location', OFFER.origin);
    // A Buy request is asked nothing about documents; a Sell offer is asked one question.
    await expect(page.locator('#docs-seen-row'), 'a Buy request must not ask about documents').toBeHidden();
    await expect(page.locator('#docs_showable'), 'the "can documents be shown" question is gone').toHaveCount(0);
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
      .toHaveText('Poster: Principal', { timeout: 15_000 });
    // Every Sell listing shows the one fixed documents line; a Buy request shows none.
    await expect(page.locator('.list-row', { hasText: sellRef }).locator('[data-docs-line]'))
      .toHaveText('Documents: after the introduction, subject to agreement between the parties.');
    await expect(page.locator('.list-row', { hasText: buy[0].reference_number }).locator('[data-docs-line]')).toHaveCount(0);
  });
  // Readiness ticks (sql/066): optional, Principal only, for the Operator's eyes only.
  test('Item66 readiness ticks: only a Principal is offered them; the Operator sees them; no other member does', async ({ page }) => {
    const before = await postedBy(poster);
    await signIn(page, poster, 'app.html');
    await fillOffer(page);

    // Not a principal: nothing to tick.
    await page.selectOption('#poster_role', 'broker');
    await expect(page.locator('#readiness-row')).toBeHidden();
    await page.selectOption('#poster_role', 'mandated');
    await expect(page.locator('#readiness-row')).toBeHidden();

    // A producer sees the two producer ticks and none of the trader's.
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#readiness-row')).toBeHidden();  // until Producer or Trader is chosen
    await page.selectOption('#principal_kind', 'producer');
    await expect(page.locator('#readiness-intro')).toHaveText('Optional. You may indicate the current status of your supply.');
    await expect(page.locator('#readiness-row input[value="own_available"]')).toBeVisible();
    await expect(page.locator('#readiness-row input[value="own_scheduled"]')).toBeVisible();
    await expect(page.locator('#readiness-row input[value="ex_stock"]')).toBeHidden();
    await expect(page.locator('#readiness-row input[value="buy_ready"]')).toBeHidden();
    await page.check('#readiness-row input[value="own_available"]');

    // A trader sees the trader's two; the producer tick is cleared, not carried over.
    await page.selectOption('#principal_kind', 'trader');
    await expect(page.locator('#readiness-row input[value="ex_stock"]')).toBeVisible();
    await expect(page.locator('#readiness-row input[value="own_available"]')).toBeHidden();
    await expect(page.locator('#readiness-row input[value="own_available"]')).not.toBeChecked();
    await page.check('#readiness-row input[value="back_to_back"]');

    await page.selectOption('#docs_seen', 'yes');
    await page.check('#truth-confirm');
    await submitListing(page);
    await expect.poll(() => postedBy(poster), { timeout: 20_000 }).toBe(before + 1);
    const { rows } = await query(
      `select id, reference_number, readiness from public.listings
        where user_id = (select id from public.profiles where email = $1)
        order by created_at desc limit 1`, [poster.email]);
    expect(rows[0].readiness).toEqual(['back_to_back']);
    const sellRef = rows[0].reference_number;
    const sellId = rows[0].id;

    // A Buy request: the buyer's Principal wording, the buyer intro and the one tick.
    await openScreen(page, 'new-listing');
    await page.check('input[name="type"][value="buy"]');
    await expect(page.locator('#poster_role option[value="principal"]')).toHaveText('Principal - I purchase as the contracting party');
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#kind-row')).toBeHidden();
    await expect(page.locator('#readiness-intro')).toHaveText('Optional. You may indicate the current status of your purchase.');
    await expect(page.locator('#readiness-row input[value="buy_ready"]')).toBeVisible();
    await expect(page.locator('#readiness-row input')).toHaveCount(5);
    await page.check('input[name="type"][value="sell"]');
    await expect(page.locator('#poster_role option[value="principal"]'),
      'the seller keeps today\'s Principal wording').toHaveText(
      'Principal - I produce the goods or hold legal title to them / I purchase as the contracting party');
    await signOut(page);

    // PROHIBITION: another member never sees a tick, in Browse or anywhere else they can reach.
    await signIn(page, reader, 'app.html');
    await openScreen(page, 'browse');
    const row = page.locator('.list-row', { hasText: sellRef });
    await expect(row.locator('[data-statements]')).toBeVisible({ timeout: 15_000 });
    await expect(row).not.toContainText('Back-to-back');
    await expect(page.locator('#browse-results, main').first()).not.toContainText('supply contract in place');
    const { data, error } = await page.evaluate(async (id) => {
      const r = await myplatform.from('listings').select('readiness').eq('id', id);
      return { data: r.data, error: r.error && r.error.message };
    }, sellId).catch(() => ({ data: [], error: 'client not reachable' }));
    expect(error ?? null).toBeNull();
    expect(data, "another member's listing must return no row, so no tick").toEqual([]);
    await signOut(page);

    // The Operator sees it in the listing view, under the poster's statements.
    await signIn(page, operator, 'operator.html');
    await openScreen(page, 'listings');
    await expect(page.locator(`[data-poster-for="${sellId}"]`))
      .toContainText('ticked: Back-to-back: supply contract in place.', { timeout: 15_000 });
  });
});
