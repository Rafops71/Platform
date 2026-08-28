// Saved searches and the watchlist, which are the same feature: a saved search
// with only a commodity in it is "watch this commodity".
//
// The assertion that matters most is the match count. A count that disagrees
// with what Browse then shows is worse than no count at all - it would send
// somebody to an empty screen - so this spec saves a search, reads the number
// off the dashboard, opens it, and counts what Browse actually renders.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { openScreen, signIn } = require('./helpers/session');
const { query } = require('../../scripts/db');

// Both are in the seeded commodity list, because the Browse filter is a
// dropdown of that list and cannot select a name that is not in it.
const COMMODITY = 'Antimony';
const OTHER_COMMODITY = 'Zinc Concentrate';

let watcher, poster;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  watcher = await createAccount({ label: 'savedwatch', role: 'participant', status: 'approved' });
  poster = await createAccount({ label: 'savedpost', role: 'participant', status: 'approved' });

  // Two listings the watcher does not own, so what they see is the anonymised
  // view rather than their own rows.
  await insertListing(poster.profileId, 'sell', COMMODITY, 'Chile');
  await insertListing(poster.profileId, 'sell', COMMODITY, 'Peru');
  await insertListing(poster.profileId, 'buy', OTHER_COMMODITY, 'Spain');
});

test.afterAll(async () => { await cleanup(); });

async function insertListing(profileId, type, commodity, region) {
  const column = type === 'sell' ? 'origin' : 'destination';
  await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, ${column}, status, reference_number)
     values ($1, $2, $3, 100, 'Metric tons', 'FOB', $4, 'available', public.next_reference($2))`,
    [profileId, type, commodity, region]
  );
}

/** How many listings match a set of criteria, asked of the database with the
 *  same rules the page applies. Hardcoding a number would make this spec depend
 *  on the live project holding no other Antimony listing, which is not
 *  something a test should assume about a database other people write to. */
async function expectedMatches({ commodity, listing_type, region }) {
  const { rows } = await query(
    `select count(*)::int n from public.listings
      where status <> 'archived'
        and ($1::text is null or commodity ilike '%' || $1 || '%')
        and ($2::text is null or type = $2)
        and ($3::text is null or
             coalesce(case when type = 'sell' then origin else destination end, '') ilike '%' || $3 || '%')`,
    [commodity || null, listing_type || null, region || null]
  );
  return rows[0].n;
}

async function savedRows() {
  const { rows } = await query(
    'select * from public.saved_searches where user_id = $1 order by created_at', [watcher.profileId]);
  return rows;
}

test.describe.serial('saved searches and watchlist', () => {

  test('the dashboard says so when nothing is saved', async ({ page }) => {
    await signIn(page, watcher);
    await expect(page.locator('#saved-searches-list')).toContainText('Nothing saved yet', { timeout: 15_000 });
  });

  test('a search saved from Browse appears on the dashboard with its criteria', async ({ page }) => {
    await signIn(page, watcher);
    await openScreen(page, 'browse');

    await page.fill('#browse-filter-region', 'Chile');
    await page.selectOption('#browse-filter-type', 'sell');
    await page.selectOption('#browse-filter-commodity', { label: COMMODITY });
    await page.click('#browse-save-search-btn');
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    const rows = await savedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].commodity).toBe(COMMODITY);
    expect(rows[0].listing_type).toBe('sell');
    expect(rows[0].region).toBe('Chile');
    // Empty criteria are stored as null, never '', or the uniqueness index
    // would treat "any status" saved twice as two different searches.
    expect(rows[0].listing_status).toBeNull();

    await openScreen(page, 'my-listings');
    const saved = page.locator('#saved-searches-list .list-row');
    await expect(saved).toHaveCount(1, { timeout: 15_000 });
    await expect(saved).toContainText(COMMODITY);
    await expect(saved).toContainText('Sell Offer');
    await expect(saved).toContainText('Chile');
  });

  test('the match count is the number of listings Browse then shows', async ({ page }) => {
    const expected = await expectedMatches({ commodity: COMMODITY, listing_type: 'sell', region: 'Chile' });
    expect(expected).toBeGreaterThanOrEqual(1);   // this run's own listing

    await signIn(page, watcher);
    const badge = page.locator('#saved-searches-list .list-row .badge').first();
    await expect(badge).toHaveText(`${expected} matching`, { timeout: 15_000 });

    // The count is only worth anything if opening the search lands on exactly
    // those listings. One of the two Antimony listings is in Peru, so a count
    // that ignored the region would be one too many here and the participant
    // would arrive at a shorter list than they were promised.
    await page.click('[data-open-search]');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await expect(page.locator('#browse-list .list-row')).toHaveCount(expected, { timeout: 15_000 });
    await expect(page.locator('#browse-filter-region')).toHaveValue('Chile');
  });

  test('a bare commodity is a watchlist entry', async ({ page }) => {
    await signIn(page, watcher);
    await openScreen(page, 'browse');

    await page.selectOption('#browse-filter-commodity', { label: COMMODITY });
    await page.fill('#browse-filter-region', '');
    await page.selectOption('#browse-filter-type', '');
    await page.click('#browse-save-search-btn');
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await openScreen(page, 'my-listings');
    const rows = page.locator('#saved-searches-list .list-row');
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    // Watching a commodity catches the listings in every region, so this count
    // is strictly larger than the region-narrowed one above.
    const watched = await expectedMatches({ commodity: COMMODITY });
    const narrowed = await expectedMatches({ commodity: COMMODITY, listing_type: 'sell', region: 'Chile' });
    expect(watched).toBeGreaterThan(narrowed);
    await expect(rows.filter({ hasText: `${watched} matching` })).toHaveCount(1);
  });

  test('the same search cannot be saved twice', async ({ page }) => {
    await signIn(page, watcher);
    await openScreen(page, 'browse');

    await page.selectOption('#browse-filter-commodity', { label: COMMODITY });
    await page.click('#browse-save-search-btn');

    await expect(page.locator('.toast-error')).toContainText('already saved', { timeout: 15_000 });
    expect(await savedRows()).toHaveLength(2);
  });

  test('the labels follow the interface language', async ({ page }) => {
    await signIn(page, watcher);
    await page.locator('.lang-btn', { hasText: 'ES' }).click();

    const saved = page.locator('#saved-searches-list .list-row').filter({ hasText: 'Chile' });
    await expect(saved).toContainText('Oferta de venta', { timeout: 15_000 });
    // Stored criteria, rendered label: a label written at save time would be
    // stuck in the language it was saved in.
    await expect(page.locator('#screen-my-listings h2').nth(1)).toHaveText('Búsquedas guardadas y seguimiento');

    await page.locator('.lang-btn', { hasText: 'EN' }).click();
    await expect(saved).toContainText('Sell Offer', { timeout: 15_000 });
  });

  test('a saved search can be removed', async ({ page }) => {
    await signIn(page, watcher);
    await page.click('[data-remove-search]');
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await savedRows()).length, { timeout: 15_000 }).toBe(1);
    await expect(page.locator('#saved-searches-list .list-row')).toHaveCount(1);
  });

  test('one participant never sees another participant saved searches', async ({ page }) => {
    await signIn(page, poster);
    await expect(page.locator('#saved-searches-list')).toContainText('Nothing saved yet', { timeout: 15_000 });

    // Asked of the database directly, as a tampered page would: RLS is what
    // makes this true, not the query the dashboard happens to send.
    const visible = await page.evaluate(async () => {
      const { data } = await jericho.from('saved_searches').select('*');
      return (data || []).length;
    });
    expect(visible).toBe(0);
  });
});
