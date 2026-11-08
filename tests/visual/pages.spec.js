// The public pages, in both languages, at desktop and phone size, compared
// with their approved pictures. No database is touched: the Supabase
// settings are answered with an address that goes nowhere, so the pages show
// exactly what a signed-out stranger sees before any answer arrives.

'use strict';

const { test, expect } = require('@playwright/test');

const NOWHERE = `
const SUPABASE_URL = 'http://127.0.0.1:9';
const SUPABASE_PUBLISHABLE_KEY = 'picture-check';
const myplatform = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
`;

const PAGES = ['index', 'register', 'reset', 'terms'];

// A page with a film (index, register) must not be photographed while the film
// is still loading: Chromium draws a loading circle over it (517 pixels on the
// phone start page, PR 93). The films are preload="none", so they never reach
// readyState 2 and showing a first frame is not what is waited for; what is
// waited for is that no film is in the middle of loading (networkState is not
// LOADING) and that each poster picture is loaded and decoded. If that does not
// happen within the time, the test FAILS saying so - it never skips or carries on.
async function waitForFilmsToSettle(page, label) {
  const films = await page.evaluate(() => document.querySelectorAll('video').length);
  if (!films) return;
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('video')].every((v) => v.networkState !== v.NETWORK_LOADING),
      null, { timeout: 15_000 });
    await page.evaluate(async () => {
      for (const v of document.querySelectorAll('video')) {
        if (!v.poster) continue;
        const img = new Image();
        img.src = v.poster;
        await img.decode();
      }
    });
  } catch (err) {
    throw new Error(`${label}: a film on the page was still loading, or its poster picture did not load, after 15 seconds, so the picture was not taken (${err.message})`);
  }
  // Even an idle film (networkState 1, readyState 0, nothing loaded) can have the
  // browser's loading circle drawn over it, caught at a different angle on each
  // shot (429 to 538 pixels on the phone start page, PR 93; it appeared in every
  // one of 25 local shots, and in some CI runs only). Switching the film's own
  // controls off and on makes the browser work out their state afresh from the
  // film's real state, which is idle: the circle is gone and the controls are
  // the ones a member sees (15 of 15 local shots identical). Nothing is hidden,
  // masked or stubbed, and no approved picture changes.
  await page.evaluate(() => {
    for (const v of document.querySelectorAll('video')) {
      v.controls = false;
      void v.offsetHeight;
      v.controls = true;
    }
  });
  // One painted frame after the last change, so nothing is caught half-drawn.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

for (const lang of ['en', 'es']) {
  for (const name of PAGES) {
    test(`${name} (${lang}) looks as approved`, async ({ page }) => {
      await page.route('**/js/supabase-config.js', (r) =>
        r.fulfill({ status: 200, contentType: 'application/javascript', body: NOWHERE }));
      await page.addInitScript((l) => { try { localStorage.setItem('myplatform.language', l); } catch { /* none */ } }, lang);
      await page.goto(`/${name}.html`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await waitForFilmsToSettle(page, `${name} (${lang})`);
      await expect(page).toHaveScreenshot(`${name}-${lang}.png`, { fullPage: true });
    });
  }
}
