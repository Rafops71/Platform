// The language a member chooses is saved on their profile, in order: the LAST choice wins.
//
//   Item101 pressing ES then EN (or the reverse) quickly leaves the profile on the last choice, even when the first save
//           is the slow one. Notification emails are composed from profiles.language (sql/008), so a profile that ends on
//           the older choice sends the member email in the wrong language.
//
// Found in CI run 45756301030: two un-awaited updates could reach the database in either order (js/app.js onLanguageChange).
// The test makes the order deterministic instead of hoping for it: the update that writes Spanish is held back for two
// seconds by the browser, the update that writes English is let through at once. Without the in-order writes the held-back
// Spanish update lands LAST and the profile ends 'es'. The profile is read once the page has no request in flight, so a
// late write cannot be missed.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, restoreEnglish } = require('./helpers/session');
const { query } = require('../../scripts/db');

let member;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  member = await createAccount({ label: 'lastlang', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

const languageOnProfile = async () =>
  (await query('select language from public.profiles where id = $1', [member.profileId])).rows[0].language;

/** Hold back, by two seconds, every update of the profile that writes Spanish; let the others through at once. */
async function slowSpanishSaves(page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH' && /"language"\s*:\s*"es"/.test(req.postData() || '')) await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
}

test.describe.serial('the last language choice is the one saved', () => {

  test('Item101 ES then EN, with the Spanish save slow: the profile ends on English', async ({ page }) => {
    test.setTimeout(90_000);
    await query(`update public.profiles set language = 'en' where id = $1`, [member.profileId]);
    await slowSpanishSaves(page);
    await signIn(page, member);
    await page.locator('.lang-btn', { hasText: 'ES' }).first().click();
    await page.locator('.lang-btn', { hasText: 'EN' }).first().click();
    await page.waitForLoadState('networkidle');
    expect(await languageOnProfile(), 'the older choice (es) was written after the newer one (en)').toBe('en');
  });

  test('Item101 EN then ES, then EN then ES again: the profile ends on the last press', async ({ page }) => {
    test.setTimeout(90_000);
    await query(`update public.profiles set language = 'en' where id = $1`, [member.profileId]);
    await slowSpanishSaves(page);
    await signIn(page, member);
    for (const lang of ['ES', 'EN', 'ES']) await page.locator('.lang-btn', { hasText: lang }).first().click();
    await page.waitForLoadState('networkidle');
    expect(await languageOnProfile(), 'the profile did not end on the last choice (es)').toBe('es');
    await restoreEnglish(page, member.profileId);
  });
});
