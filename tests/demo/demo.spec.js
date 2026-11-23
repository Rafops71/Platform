// Tests for the DEMO build. No .env, no live database, no network to Supabase.
//
//   npm run test:demo
//
// The demo is for members only (owner's correction, 3 Nov): there is no
// Operator entry and no Operator console in it. Since 23 Nov 2026 its first page is the
// name, ONE entry button and the language switch: one example member, no password, no film
// (docs/AGREED-2026-11-23-demo-one-member.md).
//
// What these prove:
//   1. Every demo page carries the "example data, nothing is saved" ribbon.
//   2. Every request the demo makes goes to its own host or to Google Fonts,
//      which the live site also uses. Anything else fails the test.
//   3. The demo files contain no real Supabase address or key.
//   4. Every member tab renders without an uncaught script error and without
//      an error message on screen.
//   5. A member cannot see another member's listings or messages.
//   6. The Operator console is absent: no files, no page, no sign-in entry,
//      and the Operator's e-mail address does not sign in on the form.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const RIBBON = 'DEMO — example data, nothing is saved';
const DIST = path.resolve(__dirname, '..', '..', 'dist-demo');
const REAL_CONFIG = path.resolve(__dirname, '..', '..', 'js', 'supabase-config.js');
const OPERATOR_EMAIL = 'operator@example.com';

// The only hosts the demo may contact: its own, and Google Fonts (the live site
// loads the same fonts). Matched against the host part of each request.
const ALLOWED_EXTRA_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Text the app shows when a database call fails. Seeing any of it on screen
// means a tab is broken, even though no script threw.
const ERROR_TEXT = [
  'Could not find the function',
  'does not exist',
  'permission denied',
  'JSON object requested',
  'Your account is not active',
  'violates',
  'Failed to fetch',
];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

// Attach to a page: remember every request host and every uncaught error.
function watch(page) {
  const hosts = new Set();
  const errors = [];
  page.on('request', (r) => {
    try { hosts.add(new URL(r.url()).host); } catch (e) { /* data: and similar */ }
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return { hosts, errors };
}

// Every request host must be the demo's own host or an allowed font host.
function unexpectedHosts(hosts, baseURL) {
  const own = new URL(baseURL).host;
  return [...hosts].filter((h) => h !== own && !ALLOWED_EXTRA_HOSTS.includes(h));
}

async function errorTextOn(page) {
  const text = await page.locator('body').innerText();
  return ERROR_TEXT.filter((t) => text.includes(t));
}

const ENTER = 'Enter as Member';
/** The one entry button of the member demo's first page. */
async function enter(page) {
  await page.goto('/index.html');
  await page.getByRole('button', { name: ENTER, exact: true }).click();
  await page.waitForURL('**/app.html');
  await page.waitForTimeout(800);
}

async function clickNav(page, label) {
  await page.locator('nav').getByText(label, { exact: true }).first().click();
  // Wait for the tab's own content to settle, rather than a fixed pause.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

async function navLabels(page) {
  return page.$$eval('nav a, nav button', (els) =>
    [...new Set(els.map((e) => e.textContent.trim()).filter(Boolean))]);
}

test.describe('demo build', () => {
  test('the demo files hold no real Supabase address or key', () => {
    expect(fs.existsSync(DIST), 'dist-demo/ must exist (npm run build:demo)').toBe(true);
    const real = fs.readFileSync(REAL_CONFIG, 'utf8');
    const url = (real.match(/https:\/\/[a-z0-9-]+\.supabase\.co/) || [])[0];
    const key = (real.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0];
    expect(url && key, 'the real URL and key must be readable to be checked').toBeTruthy();

    // Every file, whatever its extension: a key hidden in a video or a map
    // file would still be a key shipped to the public.
    const offenders = [];
    for (const file of listFiles(DIST)) {
      const text = fs.readFileSync(file).toString('latin1');
      for (const bad of ['supabase.co', 'sb_publishable_', 'sb_secret_', url, key]) {
        if (text.includes(bad)) offenders.push(`${path.relative(DIST, file)} contains "${bad}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the demo has no Operator console in its files', () => {
    expect(fs.existsSync(DIST), 'dist-demo/ must exist (npm run build:demo)').toBe(true);
    expect(fs.existsSync(path.join(DIST, 'operator.html')), 'operator.html must not be in the demo').toBe(false);
    expect(fs.existsSync(path.join(DIST, 'js', 'operator.js')), 'js/operator.js must not be in the demo').toBe(false);
  });

  test('every member page shows the example-data ribbon, signed in or not', async ({ page }) => {
    for (const p of ['index.html', 'register.html', 'reset.html', 'terms.html']) {
      await page.goto('/' + p);
      await expect(page.locator('#demo-ribbon'), p).toHaveText(RIBBON);
      await expect(page.locator('#demo-ribbon'), p).toBeVisible();
    }
    // The signed-in member page needs a signed-in tab.
    await enter(page);
    await expect(page.locator('#demo-ribbon')).toHaveText(RIBBON);
  });

  test('the first page is the name, ONE entry button and the language switch, and nothing else', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByRole('button', { name: ENTER, exact: true }), 'one entry button').toHaveCount(1);
    await expect(page.locator('main button:not(.lang-btn)'), 'no other button on the page').toHaveCount(1);
    await expect(page.getByRole('button', { name: /Member B|Member A/ }), 'no second member, no letters').toHaveCount(0);
    await expect(page.getByRole('button', { name: /Operator/ }), 'no Operator button').toHaveCount(0);
    await expect(page.locator('h1')).toHaveText('MyPlatform');
    await expect(page.locator('#lang-toggle .lang-btn'), 'the EN / ES switch stays').toHaveCount(2);
    // Nothing that asks for a password or an email, and no sentence or feature line under the name.
    await expect(page.locator('input'), 'no input of any kind').toHaveCount(0);
    await expect(page.locator('#login-form, #password, #email, #forgot-link')).toHaveCount(0);
    const words = (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim();
    expect(words, 'the page says only the name, the language switch and the button').toBe(`EN ES MyPlatform ${ENTER}`);
  });

  test('there is no film or trailer in the member demo: no video element, no film file, no film request', async ({ page, baseURL }) => {
    const requested = [];
    page.on('request', (r) => { if (/\/films\//.test(r.url())) requested.push(r.url()); });
    await page.goto('/index.html');
    await expect(page.locator('video'), 'the first page has no video').toHaveCount(0);
    // register.html carries a hidden film card that only an invitation link ever shows; nothing in the demo shows it.
    for (const p of ['register.html', 'reset.html', 'terms.html']) {
      await page.goto('/' + p);
      await expect(page.locator('video:visible'), `${p} shows no video`).toHaveCount(0);
    }
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('video'), 'no video after switching to Spanish').toHaveCount(0);
    expect(requested, 'no film or poster was requested').toEqual([]);
    expect(fs.existsSync(path.join(DIST, 'films')), 'the demo does not ship the film files').toBe(false);
    const trailer = await page.request.get(new URL('films/trailer-en.mp4', baseURL).href);
    expect(trailer.status(), 'the trailer is not served by the demo').toBe(404);
    expect(fs.readdirSync(path.resolve(__dirname, '..', '..', 'films')).length, 'the film files stay in the repository').toBeGreaterThan(0);
  });

  test('the language switch works on the first page; the entry button stays', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect(page.getByRole('button', { name: ENTER, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('the Operator console is absent: its page is missing and its e-mail does not sign in', async ({ page, baseURL }) => {
    // The page itself: a direct visit must not show the console.
    const response = await page.goto('/operator.html');
    expect(response.status(), 'a direct visit to /operator.html').toBe(404);

    // There is no sign-in form at all any more, so nothing can be typed: not the Operator's address, not a password.
    await page.goto('/index.html');
    await expect(page.locator('#email, #password, #login-form')).toHaveCount(0);
    expect(OPERATOR_EMAIL).toBeTruthy();
  });

  test('the whole walk through the demo contacts no host but its own and the fonts', async ({ page, baseURL }) => {
    const w = watch(page);

    // The one member: every tab, then sign out.
    await enter(page);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      await clickNav(page, label);
    }
    // Browse shows the other side's offers and requests.
    await clickNav(page, 'Browse');
    await expect(page.getByText('BUY-26-001').first(), 'Browse shows the other side\'s copper request').toBeVisible();
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL('**/index.html');

    expect(unexpectedHosts(w.hosts, baseURL), 'hosts the demo contacted').toEqual([]);
  });

  test('click-through: a member sends a message, the message is in the sender\'s mailbox, no console errors', async ({ page, baseURL }) => {
    const w = watch(page);
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // Member A cannot contact its own copper sell offer, so it contacts the
    // copper request posted by Member B (BUY-26-001).
    const body = 'Demo click-through: is the copper cathode request still open for CIF Rotterdam?';
    await enter(page);
    await clickNav(page, 'Browse');
    const copper = page.locator('div', { hasText: 'BUY-26-001' })
      .filter({ has: page.getByRole('button', { name: 'Contact', exact: true }) }).last();
    await expect(copper, 'the copper request is on the Browse list').toBeVisible();
    await copper.getByRole('button', { name: 'Contact', exact: true }).click();
    await page.locator('#contact-body').fill(body);
    await page.locator('#contact-send-btn').click();
    await expect(page.locator('#contact-body'), 'the contact dialog closes after sending').toBeHidden();
    await clickNav(page, 'Mailbox');
    await expect(page.getByText(body), 'the message is in the sender\'s mailbox').toBeVisible();

    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      await clickNav(page, label);
      expect(await errorTextOn(page), `error text on the ${label} tab`).toEqual([]);
    }

    expect(consoleErrors, 'console errors').toEqual([]);
    expect(w.errors, 'uncaught script errors').toEqual([]);
    expect(unexpectedHosts(w.hosts, baseURL), 'hosts the demo contacted').toEqual([]);
  });

  test('every member tab renders without a script error or an error message', async ({ page }) => {
    const w = watch(page);
    const failures = [];

    await enter(page);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      const before = w.errors.length;
      await clickNav(page, label);
      if (w.errors.length > before) failures.push(`${label}: ${w.errors.slice(before).join(' | ')}`);
      const shown = await errorTextOn(page);
      if (shown.length) failures.push(`${label}: shows "${shown.join('", "')}"`);
    }
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL('**/index.html');

    expect(failures).toEqual([]);
  });

  test('a member sees only their own listings and mailbox', async ({ page }) => {
    // The one member posted SELL-26-001 (copper offer) and the Wheat sell offer; the other member's copper
    // request (BUY-26-001) is theirs to browse, not to see among their own.
    await enter(page);
    await clickNav(page, 'My Listings');
    // Match listing titles ("SELL-26-001 — ..."), not any text: the Help copy on this page
    // gives SELL-26-001 as an example.
    await expect(page.getByText(/^SELL-26-001 —/).first()).toBeVisible();
    await expect(page.getByText(/^BUY-26-001 —/), 'the member must not see the other member\'s copper request among their own').toHaveCount(0);
    await clickNav(page, 'Mailbox');
    await expect(page.getByText('Can you confirm the protein and Hagberg figures'),
      'the member must not see the other member\'s private message').toHaveCount(0);
  });

  test('the posting form offers the role choices for a Sell offer and for a Buy request', async ({ page }) => {
    await enter(page);
    await clickNav(page, 'New Listing');
    // Sell offer: role, then Producer or Trader for a principal.
    await page.check('input[name="type"][value="sell"]');
    const roles = await page.locator('#poster_role option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    expect(roles.sort(), 'principal, mandated and broker are all offered').toEqual(['broker', 'mandated', 'principal']);
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#kind-row'), 'a principal on a Sell offer says producer or trader').toBeVisible();
    const kinds = await page.locator('#principal_kind option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    expect(kinds.sort()).toEqual(['producer', 'trader']);
    await page.selectOption('#poster_role', 'mandated');
    await expect(page.locator('#mandate-row')).toBeVisible();
    await page.selectOption('#poster_role', 'broker');
    await expect(page.locator('#broker-row')).toBeVisible();
    // Buy request: the same role choice, with no producer or trader.
    await page.check('input[name="type"][value="buy"]');
    await page.selectOption('#poster_role', 'principal');
    await expect(page.locator('#kind-row'), 'a Buy request is not asked producer or trader').toBeHidden();
  });

  test('the member can post a buy request and then finds it among their own listings', async ({ page }) => {
    await enter(page);
    await clickNav(page, 'New Listing');
    await page.check('input[name="type"][value="buy"]');
    await page.selectOption('#commodity-select', { index: 1 });
    await page.fill('#quantity', '250');
    await page.selectOption('#unit', { index: 1 });
    await page.selectOption('#incoterm', 'CIF');
    await page.selectOption('#location', { index: 1 });
    await page.selectOption('#poster_role', 'principal');
    await page.check('#truth-confirm');
    await page.click('#listing-submit-btn');
    await clickNav(page, 'My Listings');
    await expect(page.getByText(/^BUY-26-\d+ —/).first(), 'the new buy request is listed').toBeVisible({ timeout: 10_000 });
  });
});
