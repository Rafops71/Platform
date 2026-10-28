// The public pages, in both languages, at desktop and phone size, compared
// with their approved pictures. No database is touched: the Supabase
// settings are answered with an address that goes nowhere, so the pages show
// exactly what a signed-out stranger sees before any answer arrives.

'use strict';

const { test, expect } = require('@playwright/test');

const NOWHERE = `
const SUPABASE_URL = 'http://127.0.0.1:9';
const SUPABASE_PUBLISHABLE_KEY = 'picture-check';
const jericho = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
`;

const PAGES = ['index', 'register', 'reset', 'terms', 'help'];

for (const lang of ['en', 'es']) {
  for (const name of PAGES) {
    test(`${name} (${lang}) looks as approved`, async ({ page }) => {
      await page.route('**/js/supabase-config.js', (r) =>
        r.fulfill({ status: 200, contentType: 'application/javascript', body: NOWHERE }));
      await page.addInitScript((l) => { try { localStorage.setItem('jericho.language', l); } catch { /* none */ } }, lang);
      await page.goto(`/${name}.html`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}-${lang}.png`, { fullPage: true });
    });
  }
}
