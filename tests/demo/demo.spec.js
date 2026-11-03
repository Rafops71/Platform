// Tests for the DEMO build. No .env, no live database, no network to Supabase.
//
//   npm run test:demo
//
// What these prove:
//   1. Every demo page carries the "example data, nothing is saved" ribbon.
//   2. A walk through both members' screens and the Operator's screens makes
//      no request to Supabase. (The check is on the request host, so a
//      request to the real project would fail the test even if it succeeded.)
//   3. The demo files contain no real Supabase address or key.
//   4. Every tab on each side renders without an uncaught script error.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const RIBBON = 'DEMO — example data, nothing is saved';
const DIST = path.resolve(__dirname, '..', '..', 'dist-demo');
const REAL_CONFIG = path.resolve(__dirname, '..', '..', 'js', 'supabase-config.js');

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

// Attach to a page: remember every request host and every uncaught error.
function watch(page) {
  const hosts = new Set();
  const urls = [];
  const errors = [];
  page.on('request', (r) => {
    try { hosts.add(new URL(r.url()).host); urls.push(r.url()); } catch (e) { /* data: and similar */ }
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return { hosts, urls, errors };
}

async function signInAs(page, label) {
  await page.goto('/index.html');
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function clickNav(page, label) {
  await page.locator('nav').getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(400);
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

    const offenders = [];
    for (const file of listFiles(DIST)) {
      if (!/\.(html|js|css|json|txt|md|svg)$/i.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const bad of ['supabase.co', 'sb_publishable_', 'sb_secret_', url, key]) {
        if (text.includes(bad)) offenders.push(`${path.relative(DIST, file)} contains "${bad}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every page shows the example-data ribbon', async ({ page }) => {
    for (const p of ['index.html', 'register.html', 'reset.html', 'terms.html', 'help.html']) {
      await page.goto('/' + p);
      await expect(page.locator('#demo-ribbon'), p).toHaveText(RIBBON);
      await expect(page.locator('#demo-ribbon'), p).toBeVisible();
    }
  });

  test('the sign-in page offers three buttons and no password is needed', async ({ page }) => {
    await page.goto('/index.html');
    for (const label of ['Enter as Member A', 'Enter as Member B', 'Enter as Operator']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('the whole walk through the demo makes no request to Supabase', async ({ page }) => {
    const w = watch(page);

    // Member A: every tab, then sign out.
    await signInAs(page, 'Enter as Member A');
    await page.waitForURL('**/app.html');
    await page.waitForTimeout(1200);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      await clickNav(page, label);
    }
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL('**/index.html');

    // Member B.
    await signInAs(page, 'Enter as Member B');
    await page.waitForURL('**/app.html');
    await page.waitForTimeout(1200);
    await clickNav(page, 'Browse');
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL('**/index.html');

    // The Operator: every tab.
    await signInAs(page, 'Enter as Operator');
    await page.waitForURL('**/operator.html');
    await page.waitForTimeout(1200);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      await clickNav(page, label);
    }

    // Judged by host, not by the word in a URL: the demo's own file is named
    // mock-supabase.js and lives on the demo's own host.
    const supabaseHosts = [...w.hosts].filter((h) => /supabase/i.test(h));
    expect(supabaseHosts, 'hosts the demo contacted').toEqual([]);
    expect(w.hosts.size, 'the demo did contact its own host').toBeGreaterThan(0);
  });

  test('every tab on each side renders without an uncaught script error', async ({ page }) => {
    const w = watch(page);
    const failures = [];

    await signInAs(page, 'Enter as Member A');
    await page.waitForURL('**/app.html');
    await page.waitForTimeout(1200);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      const before = w.errors.length;
      await clickNav(page, label);
      if (w.errors.length > before) failures.push(`member A, ${label}: ${w.errors.slice(before).join(' | ')}`);
    }
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL('**/index.html');

    await signInAs(page, 'Enter as Operator');
    await page.waitForURL('**/operator.html');
    await page.waitForTimeout(1200);
    for (const label of await navLabels(page)) {
      if (label === 'Sign out') continue;
      const before = w.errors.length;
      await clickNav(page, label);
      if (w.errors.length > before) failures.push(`operator, ${label}: ${w.errors.slice(before).join(' | ')}`);
    }

    expect(failures).toEqual([]);
  });
});
