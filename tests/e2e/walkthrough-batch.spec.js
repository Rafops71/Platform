// The three small changes from the owner's walkthrough of 18 Nov 2026
// (docs/AGREED-2026-11-18-walkthrough-batch.md). Tests carry the item numbers of the
// functions they touch, as the reconcile tests did for Item 78:
//
//   Item06  a person who is not approved cannot sign in, and is told why
//           (rejected and suspended have their own sentence; pending is unchanged)
//   Item18  a member can browse other members' listings, in the order they choose
//   Item23  sorting never changes which listings Browse shows or counts
//
// The register page's Terms (Items 07 and 08) are tested in terms.spec.js.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, openScreen, submitListing, pickCommodity, pagePattern } = require('./helpers/session');
const { query } = require('../../scripts/db');

const POSTER = { first_name: 'Wexbridge', last_name: 'Tallowmere', company: 'Tallowmere Metals NV', phone: '+32471558001' };
const WATCHER = { first_name: 'Olwenna', last_name: 'Fairbourne', company: 'Fairbourne Trading', phone: '+32471558002' };

// Posted in this order, so "newest first" is Iron Ore, Copper Cathode, Zinc Ingots.
// Alphabetically that is Copper, Iron, Zinc, so the three orders are all different.
const POSTS = [
  { commodity: 'Zinc Ingots',    notes: 'sort test one' },
  { commodity: 'Copper Cathode', notes: 'sort test two' },
  { commodity: 'Iron Ore',       notes: 'sort test three' },
];

let operator, poster, watcher, rejected, suspended;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  assertConfigured();
  await cleanup();
  operator  = await createAccount({ label: 'wtop', role: 'operator', status: 'approved' });
  poster    = await createAccount({ label: 'wtpost', role: 'participant', status: 'approved', meta: POSTER });
  watcher   = await createAccount({ label: 'wtwatch', role: 'participant', status: 'approved', meta: WATCHER });
  rejected  = await createAccount({ label: 'wtrej', role: 'participant', status: 'rejected' });
  suspended = await createAccount({ label: 'wtsus', role: 'participant', status: 'suspended' });
});

test.afterAll(async () => { await cleanup(); });

async function tryToSignIn(page, account) {
  await page.goto('/index.html');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('#login-btn');
}

test.describe.serial('the walkthrough batch', () => {

  test('Item06 a rejected person cannot sign in and is told the registration was not approved', async ({ page }) => {
    await tryToSignIn(page, rejected);
    await page.waitForURL(pagePattern('index.html', { query: '?blocked=rejected' }), { timeout: 20_000 });
    await expect(page.locator('#notice')).toHaveText('Your registration was not approved.');
    // Not signed in: asking for the dashboard bounces back.
    await page.goto('/app.html');
    await page.waitForURL(pagePattern('index.html'), { timeout: 20_000 });
  });

  test('Item06 a suspended member cannot sign in and is told the account has been suspended', async ({ page }) => {
    await tryToSignIn(page, suspended);
    await page.waitForURL(pagePattern('index.html', { query: '?blocked=suspended' }), { timeout: 20_000 });
    await expect(page.locator('#notice')).toHaveText('This account has been suspended.');
  });

  test('Item06 both sentences appear in Spanish, and a wrong password or a stranger learns nothing about any account', async ({ page }) => {
    await page.goto('/index.html?blocked=rejected');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(page.locator('#notice')).toHaveText('Su registro no fue aprobado.');
    await page.goto('/index.html?blocked=suspended');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(page.locator('#notice')).toHaveText('Esta cuenta ha sido suspendida.');

    // Any other word keeps the general sentence: the address cannot make the page say anything else.
    await page.goto('/index.html?blocked=anything-else');
    await expect(page.locator('#notice')).toContainText('Esta cuenta no está activa actualmente');

    // The sentence is shown only after a correct sign-in. A WRONG password on the suspended account shows
    // the ordinary error and neither status sentence; a plain visit shows no notice at all.
    await page.goto('/index.html');
    await expect(page.locator('#notice')).toBeHidden();
    await page.fill('#email', suspended.email);
    await page.fill('#password', 'not-the-password-0');
    await page.click('#login-btn');
    await expect(page.locator('.toast-error')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toContain('blocked=');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/suspended|suspendida|not approved|no fue aprobado/i);
  });

  test('Item06 a pending person still gets the pending sentence, unchanged', async ({ page }) => {
    const pending = await createAccount({ label: 'wtpend', role: 'participant', status: 'pending' });
    await tryToSignIn(page, pending);
    await page.waitForURL(pagePattern('index.html', { query: '?pending=1' }), { timeout: 20_000 });
    await expect(page.locator('#notice')).toHaveText('Your registration is awaiting Operator approval. You will be able to sign in once approved.');
  });

  test('Item18 the poster lists three commodities, one after the other', async ({ page }) => {
    await signIn(page, poster, 'app.html');
    for (const p of POSTS) {
      await openScreen(page, 'new-listing');
      await page.check('input[name="type"][value="sell"]');
      await pickCommodity(page, p.commodity);
      await page.fill('#quantity', '100');
      await page.selectOption('#unit', 'Metric tons');
      await page.selectOption('#incoterm', 'FOB');
      await page.selectOption('#location', 'Chile');
      await page.fill('#notes', p.notes);
      await submitListing(page);
      await expect.poll(async () => {
        const r = await query('select count(*)::int n from public.listings where notes = $1', [p.notes]);
        return r.rows[0].n;
      }, { timeout: 20_000 }).toBe(1);
    }
    await signOut(page);
  });

  test('Item18 Browse sorts newest first by default, oldest first, or commodity A to Z, and the labels are the owner\'s', async ({ page }) => {
    await signIn(page, watcher, 'app.html');
    await openScreen(page, 'browse');
    await expect(page.locator('label[for="browse-sort"]')).toHaveText('Sort by');
    const options = await page.locator('#browse-sort option').allTextContents();
    expect(options).toEqual(['Newest first', 'Oldest first', 'Commodity A to Z']);
    await expect(page.locator('#browse-sort')).toHaveValue('newest');

    // Which of this test's three rows come first, read from the screen (other rows may exist; only these matter).
    const mine = async () => {
      const titles = await page.locator('#browse-list .list-row-title').allTextContents();
      return titles.map((t) => POSTS.find((p) => t.includes(p.commodity))).filter(Boolean).map((p) => p.commodity);
    };
    await expect(page.locator('#browse-list .list-row').first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(mine, { timeout: 15_000 }).toEqual(['Iron Ore', 'Copper Cathode', 'Zinc Ingots']);

    await page.selectOption('#browse-sort', 'oldest');
    await expect.poll(mine, { timeout: 15_000 }).toEqual(['Zinc Ingots', 'Copper Cathode', 'Iron Ore']);

    await page.selectOption('#browse-sort', 'commodity');
    await expect.poll(mine, { timeout: 15_000 }).toEqual(['Copper Cathode', 'Iron Ore', 'Zinc Ingots']);
    // The whole list is alphabetical by commodity, not only this test's rows (item 17's order).
    await expect.poll(async () => {
      const titles = await page.locator('#browse-list .list-row-title').allTextContents();
      const names = titles.map((t) => t.split(' — ').slice(1).join(' — '));
      const sorted = [...names].sort((a, b) => {
        const ao = a.toLowerCase() === 'other', bo = b.toLowerCase() === 'other';
        if (ao !== bo) return ao ? 1 : -1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      });
      return JSON.stringify(names) === JSON.stringify(sorted);
    }, { timeout: 15_000 }).toBe(true);
  });

  test('Item23 sorting never changes which listings Browse shows or counts, and a saved search counts the same in every order', async ({ page }) => {
    await signIn(page, watcher, 'app.html');
    await openScreen(page, 'browse');
    const rows = page.locator('#browse-list .list-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const refs = async () => (await page.locator('#browse-list .list-row-title').allTextContents()).map((t) => t.split(' — ')[0]).sort();

    await page.selectOption('#browse-sort', 'newest');
    await expect(rows.first()).toBeVisible();
    const base = await refs();
    expect(base.length).toBeGreaterThanOrEqual(3);
    for (const mode of ['oldest', 'commodity']) {
      await page.selectOption('#browse-sort', mode);
      await expect.poll(async () => JSON.stringify(await refs()), { timeout: 15_000 }).toBe(JSON.stringify(base));
    }

    // With a filter on: the same listings in every order, and the same number the filter alone gives.
    await page.selectOption('#browse-filter-commodity', 'Iron Ore');
    await page.click('#browse-refresh-btn');
    await page.selectOption('#browse-sort', 'newest');
    await expect.poll(async () => (await refs()).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const filtered = await refs();
    for (const mode of ['oldest', 'commodity']) {
      await page.selectOption('#browse-sort', mode);
      await expect.poll(async () => JSON.stringify(await refs()), { timeout: 15_000 }).toBe(JSON.stringify(filtered));
    }
    expect(filtered.length).toBeLessThan(base.length);
  });

  test('Item18 the sort labels are in Spanish too', async ({ page }) => {
    await signIn(page, watcher, 'app.html');
    await openScreen(page, 'browse');
    await page.locator('.lang-btn', { hasText: 'ES' }).click();
    await expect(page.locator('label[for="browse-sort"]')).toHaveText('Ordenar por');
    await expect.poll(async () => page.locator('#browse-sort option').allTextContents(), { timeout: 10_000 })
      .toEqual(['Más recientes primero', 'Más antiguos primero', 'Materia prima de la A a la Z']);
  });
});
