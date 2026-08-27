// The stale-listing prompt on a participant's dashboard: is this still
// available, yes or no.
//
// "Stale" is one definition shared by this prompt and the Operator's workload
// count (STALE_LISTING_DAYS in js/utils.js). That sharing is what this spec is
// really protecting: if the two ever disagree, an Operator chases a listing
// whose owner was never asked about it.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { query } = require('../../scripts/db');

let owner, operator;
let staleRef, freshRef;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  owner = await createAccount({ label: 'renewowner', role: 'participant', status: 'approved' });
  operator = await createAccount({ label: 'renewop', role: 'operator', status: 'approved' });

  staleRef = await insertListing(owner.profileId, 'E2E Renewal Stale', 45);
  freshRef = await insertListing(owner.profileId, 'E2E Renewal Fresh', 0);
});

test.afterAll(async () => { await cleanup(); });

async function insertListing(profileId, commodity, updatedDaysAgo) {
  const { rows } = await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, status,
        reference_number, created_at, updated_at)
     values ($1, 'sell', $2, 100, 'Metric tons', 'FOB', 'Chile', 'available',
             public.next_reference('sell'),
             now() - ($3 || ' days')::interval - interval '5 days',
             now() - ($3 || ' days')::interval)
     returning reference_number`,
    [profileId, commodity, updatedDaysAgo]
  );
  return rows[0].reference_number;
}

// A listing cannot be made stale by updating it: protect_listing_columns()
// sets updated_at on every UPDATE, which is the whole point of the column and
// is asserted directly in sql/tests/08. So each test that needs a stale listing
// inserts one already backdated - INSERT is not the trigger's business.
async function listing(ref) {
  const { rows } = await query(
    'select * from public.listings where reference_number = $1', [ref]);
  return rows[0];
}

async function signIn(page, account, path = 'app.html') {
  await page.goto('/index.html');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('#login-btn');
  await page.waitForURL(`**/${path}`, { timeout: 20_000 });
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 20_000 });
}

function rowFor(page, ref) {
  return page.locator('#my-listings-list .list-row', { hasText: ref });
}

test.describe.serial('stale listing renewal', () => {

  test('only the stale listing is asked about', async ({ page }) => {
    await signIn(page, owner);

    const stale = rowFor(page, staleRef);
    await expect(stale.locator('.stale-notice')).toBeVisible({ timeout: 15_000 });
    await expect(stale.locator('.stale-notice')).toContainText('30 days');
    await expect(stale.locator('[data-renew]')).toBeVisible();
    await expect(stale.locator('[data-close]')).toBeVisible();

    // A listing updated today is not stale and must not be nagged about.
    await expect(rowFor(page, freshRef).locator('.stale-notice')).toHaveCount(0);
  });

  test('"still available" renews it and the prompt goes away', async ({ page }) => {
    const before = await listing(staleRef);
    await signIn(page, owner);

    await rowFor(page, staleRef).locator('[data-renew]').click();
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await listing(staleRef)).updated_at > before.updated_at,
      { timeout: 15_000 }).toBe(true);
    await expect(rowFor(page, staleRef).locator('.stale-notice')).toHaveCount(0, { timeout: 15_000 });

    // Renewing says "still current", not "changed".
    const after = await listing(staleRef);
    expect(after.status).toBe('available');
    expect(after.commodity).toBe(before.commodity);
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
  });

  test('a renewed listing has left the Operator workload count', async ({ page }) => {
    // Same definition on both sides, which is the point of sharing it: the
    // Operator's stale count and the participant's prompt are one rule.
    const { rows } = await query(
      `select count(*)::int n from public.listings
        where status = 'available' and updated_at < now() - interval '30 days'
          and user_id = $1`, [owner.profileId]);
    expect(rows[0].n).toBe(0);

    await signIn(page, operator, 'operator.html');
    await expect(page.locator('#stat-stale-value')).not.toHaveText('—', { timeout: 15_000 });
    const shown = Number(await page.locator('#stat-stale-value').innerText());
    const { rows: all } = await query(
      `select count(*)::int n from public.listings
        where status = 'available' and updated_at < now() - interval '30 days'`);
    expect(shown).toBe(all[0].n);
  });

  test('"no, close it" closes the listing instead', async ({ page }) => {
    const ref = await insertListing(owner.profileId, 'E2E Renewal Closing', 40);

    await signIn(page, owner);
    await rowFor(page, ref).locator('[data-close]').click();
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await listing(ref)).status, { timeout: 15_000 }).toBe('closed');
    // Closed, not deleted: the reference number and anything said about it
    // survive, which a counterparty mid-conversation still needs.
    expect(await listing(ref)).toBeTruthy();
    // And a closed listing is not stale - staleness only applies to what is
    // still on offer, so it stops being asked about.
    await expect(rowFor(page, ref).locator('.stale-notice')).toHaveCount(0, { timeout: 15_000 });
  });

  test('the prompt is translated', async ({ page }) => {
    const ref = await insertListing(owner.profileId, 'E2E Renewal Spanish', 40);

    await signIn(page, owner);
    await page.locator('.lang-btn', { hasText: 'ES' }).click();

    const notice = rowFor(page, ref).locator('.stale-notice');
    await expect(notice).toContainText('¿Sigue disponible?', { timeout: 15_000 });
    await expect(notice.locator('[data-renew]')).toHaveText('Sí, sigue disponible');
  });

  test('one participant cannot renew another participant listing', async ({ page }) => {
    const stranger = await createAccount({ label: 'renewstranger', role: 'participant', status: 'approved' });
    const ref = await insertListing(owner.profileId, 'E2E Renewal Stranger', 40);
    const before = await listing(ref);

    await signIn(page, stranger);
    // Sent the way a tampered page would send it: the id is not secret, so the
    // refusal has to be the database's and not the button's.
    const result = await page.evaluate(async (id) => {
      const { error } = await jericho.rpc('renew_listing', { p_listing_id: id });
      return error ? error.message : 'no error';
    }, before.id);

    expect(result).toContain('not yours');
    const after = await listing(ref);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });
});
