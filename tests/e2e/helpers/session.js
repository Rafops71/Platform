// Signing in, signing out, and switching screens — the three things almost
// every spec does before it can test anything.
//
// These had been copy-pasted into ten spec files. That is fine until the
// copies drift, and they had already started to: five different signatures
// for the same four lines, and the `#user-name` wait below was added to some
// copies and not others as each suite hit the race separately. A shared
// version means the next fix lands everywhere at once.
//
// Fixtures (accounts, listings, teardown) stay in ./fixtures — this module is
// only about driving a browser session.

'use strict';

const { expect } = require('@playwright/test');

// Long enough to absorb a cold Supabase Auth round-trip on a slow connection;
// short enough that a genuinely stuck test still fails inside the 60s
// per-test timeout in playwright.config.js.
const NAV_TIMEOUT = 20_000;

/**
 * The site's own root path, from the same address the suite is pointed at
 * (playwright.config.js: E2E_BASE_URL, else http://localhost:8000). '/' on
 * localhost and on Cloudflare, '/Platform/' on GitHub Pages' project site.
 */
const SITE_ROOT = (() => {
  const p = new URL(process.env.E2E_BASE_URL || 'http://localhost:8000').pathname;
  return p.endsWith('/') ? p : p + '/';
})();

/**
 * The address of one of the site's own pages, with or without its ".html".
 *
 * GitHub Pages serves app.html at /app.html. Cloudflare Pages answers that
 * with a 308 to /app, and index.html to /. A test that waits for the literal
 * ".html" times out there although the member is on the right page. This
 * matches the page either way - and is exactly as strict as the check it
 * replaced, or stricter:
 *
 *   pagePattern('app.html')                      exact: nothing after the page
 *                                                (was the glob `**` + `/app.html`)
 *   pagePattern('index.html', { query: '?x=1' }) exact, including that query
 *   pagePattern('index.html', { after: 'any' })  a ?query or #fragment may follow
 *                                                (was `**` + `/index.html` + `**`,
 *                                                or a substring test)
 *
 * The page must sit directly under the site's own root (SITE_ROOT): 'app.html'
 * never matches /operator or /x/app, and 'index.html' matches only the root
 * itself or root + index(.html) - never /operator/ or any other folder.
 *
 * @param {string} file e.g. 'app.html'
 * @param {{query?: string, after?: 'any'}} [opts]
 */
function pagePattern(file, opts = {}) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = file.replace(/\.html$/, '');
  const stem = base === 'index' ? '(?:index(?:\\.html)?)?' : `${base}(?:\\.html)?`;
  let tail = '$';
  if (opts.query) tail = esc(opts.query) + '$';
  else if (opts.after === 'any') tail = '(?:[?#].*)?$';
  return new RegExp('^[a-z][a-z0-9+.-]*://[^/]+' + esc(SITE_ROOT) + stem + tail);
}
const SCREEN_TIMEOUT = 15_000;

/**
 * Sign in and wait until the dashboard is actually usable.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{email: string, password: string}} account
 * @param {string} [expectedPath] - 'app.html' (default) or 'operator.html'.
 */
async function signIn(page, account, expectedPath = 'app.html') {
  await page.goto('/index.html');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('#login-btn');
  await page.waitForURL(pagePattern(expectedPath), { timeout: NAV_TIMEOUT });

  // waitForURL resolves on navigation, but both dashboards wire their tab
  // handlers inside an async DOMContentLoaded callback, after requireAuth()
  // has awaited. A nav click landing in that window hits an unwired button and
  // is silently dropped — the test then fails somewhere further down, on a
  // screen that never opened. It is load-order dependent, so it shows up as a
  // suite that passes alone and fails after the slower specs.
  //
  // #user-name is filled in the same synchronous block as wireTabs(), so a
  // non-empty name means the handlers are attached. Do not remove this without
  // reading js/app.js and js/operator.js first.
  //
  // A member signing in for the first time meets the welcome page (sql/044)
  // before any of that wiring happens. Pressing its button is part of that
  // first sign-in, so it is done here; the test that is ABOUT the welcome page
  // signs in by hand instead (tests/e2e/welcome.spec.js).
  await page.waitForFunction(() => {
    const name = document.getElementById('user-name');
    const gate = document.getElementById('welcome-gate');
    return (name && name.textContent.trim()) || (gate && !gate.classList.contains('hidden'));
  }, null, { timeout: NAV_TIMEOUT });
  if (await page.locator('#welcome-gate:not(.hidden)').count()) await page.click('#welcome-continue');
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: NAV_TIMEOUT });
}

/**
 * Sign out and wait for the login page.
 *
 * Specs that sign in as a second account must call this first: Supabase keeps
 * the session in localStorage and requireAuth() bounces an already-
 * authenticated visitor off index.html, so the second signIn would never find
 * the login form.
 */
async function signOut(page) {
  await page.click('#logout-link');
  await page.waitForURL(pagePattern('index.html'), { timeout: NAV_TIMEOUT });
}

/** Switch screens and confirm the switch actually took. */
async function openScreen(page, name) {
  await page.click(`button[data-screen="${name}"]`);
  await expect(page.locator(`#screen-${name}`)).toBeVisible({ timeout: SCREEN_TIMEOUT });
}

/** Submit the listing form, and say what it refused rather than what followed.
 *
 *  A refused submit shows an error toast (js/utils.js showToast) which removes
 *  itself after about four seconds. Nothing reads it, so the only evidence a
 *  test ever saw was a later "expected 1 listing, got 0" — the symptom, with
 *  the cause already gone from the page. Catching the toast here turns that
 *  into the database's or the form's own words.
 */
/** The statements sql/033 requires on every listing, answered as a principal
 *  who has seen documents - unless the test already answered them itself.
 *  The truth box is always ticked here: a test about refusing an unticked
 *  listing clicks the button directly instead of calling submitListing. */
async function answerListingStatements(page) {
  if (!(await page.locator('input[name="poster_role"]:checked').count())) await page.check('#role-principal');
  // A principal on a Sell offer also says Producer or Trader (sql/043).
  if (await page.locator('#kind-row:not(.hidden)').count() && !(await page.locator('input[name="principal_kind"]:checked').count())) await page.check('#kind-producer');
  if (!(await page.inputValue('#docs_seen'))) await page.selectOption('#docs_seen', 'yes');
  if (!(await page.inputValue('#docs_showable'))) await page.selectOption('#docs_showable', 'on_request');
  await page.check('#truth-confirm');
}

async function submitListing(page, selector = '#listing-submit-btn') {
  // Counted before and after, not merely looked for. An error toast lives about
  // four seconds, so a leftover one from an earlier step was enough to make
  // this report a refusal that never happened - a flake introduced by the very
  // helper meant to explain flakes. Only a NEW toast counts.
  const toasts = page.locator('.toast-error');
  const before = await toasts.count();

  if (selector === '#listing-submit-btn') await answerListingStatements(page);
  await page.click(selector);

  const refused = await page
    .waitForFunction((n) => document.querySelectorAll('.toast-error').length > n, before, { timeout: 2500 })
    .then(() => true)
    .catch(() => false);

  if (refused) {
    const said = (await toasts.last().textContent().catch(() => null)) || '(the toast vanished before it could be read)';
    throw new Error(`The listing form refused the submit: "${said.trim()}"`);
  }
}


/** Choose a commodity, and make sure the choice actually stuck.
 *
 *  Two different failures live here, both already seen.
 *
 *  The list arrives after the screen opens, so reading the options once and
 *  asserting immediately fails on a dropdown that is merely still loading.
 *  Hence the poll.
 *
 *  And the select is REBUILT when that fetch lands, which silently discards a
 *  choice made a moment earlier. bilingual.spec.js hit exactly that: it picked
 *  the commodity first, filled eight more fields, and the form then refused
 *  the submit with "Seleccione o especifique una materia prima" - the only
 *  field it lost was the first one set. So the choice is read back and made
 *  again if it did not hold.
 */
async function pickCommodity(page, name) {
  const select = page.locator('#commodity-select');

  // Values, not labels: selectOption is given the canonical English value and
  // the labels can be translated, so matching on what is displayed would break
  // the moment this runs in Spanish.
  await expect
    .poll(async () => select.locator('option').evaluateAll((os) => os.map((o) => o.value)), {
      timeout: 20_000,
      message:
        `"${name}" never appeared in the commodity dropdown. The list comes from ` +
        'sql/seed_commodities.sql and these tests pick from it, so either the ' +
        'seed changed, or this test names something the platform does not trade, ' +
        'or the screen never loaded the list at all.',
    })
    .toContain(name);

  await select.selectOption(name);

  // Not belt and braces: a redraw between the two lines above is the whole
  // reason this function exists.
  await expect
    .poll(async () => select.inputValue(), {
      timeout: 10_000,
      message: `The commodity dropdown would not hold "${name}" - it is being redrawn after the choice.`,
    })
    .toBe(name);
}

module.exports = {
  signIn, signOut, openScreen, submitListing, pickCommodity, pagePattern,
  NAV_TIMEOUT, SCREEN_TIMEOUT,
};
