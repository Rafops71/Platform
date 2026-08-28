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
  await page.waitForURL(`**/${expectedPath}`, { timeout: NAV_TIMEOUT });

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
  await page.waitForURL('**/index.html', { timeout: NAV_TIMEOUT });
}

/** Switch screens and confirm the switch actually took. */
async function openScreen(page, name) {
  await page.click(`button[data-screen="${name}"]`);
  await expect(page.locator(`#screen-${name}`)).toBeVisible({ timeout: SCREEN_TIMEOUT });
}

module.exports = { signIn, signOut, openScreen, NAV_TIMEOUT, SCREEN_TIMEOUT };
