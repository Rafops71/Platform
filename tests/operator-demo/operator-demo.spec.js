// The OPERATOR demo (dist-demo-operator/), item 42. Offline, on fake data.
//
// Proves: one sign-in button, which opens the Operator console; the console
// contacts no Supabase host; every Operator tab renders without an error; no
// console errors; no member page is served. The member demo is tested apart,
// in tests/demo.

'use strict';

const { test, expect } = require('@playwright/test');

const SUPABASE = /supabase\.(co|com|io)|cdn\.jsdelivr\.net\/npm\/@supabase/;

// Record every request and every console error, from the first page load.
function watch(page) {
  const contacted = [];
  const errors = [];
  page.on('request', (r) => { if (SUPABASE.test(r.url())) contacted.push(r.url()); });
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { contacted, errors };
}

test('the sign-in page offers one button, and it is the Operator', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#lang-toggle .lang-btn'), 'English only: no language switch').toHaveCount(0);
  const buttons = page.locator('#demo-enter button');
  await expect(buttons).toHaveCount(1);
  await expect(buttons).toHaveText('Enter as Operator');
  await expect(page.locator('#demo-enter')).not.toContainText('Member');
  await expect(page.locator('#demo-ribbon')).toContainText('example data, nothing is saved');
});

test('entering as the Operator opens the console, with no Supabase contact and no errors', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/index.html');
  await page.locator('#demo-enter button', { hasText: 'Enter as Operator' }).click();
  await page.waitForURL(/operator\.html$/);
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('#screen-overview')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.lang-btn'), 'English only: no language buttons on the console').toHaveCount(0);
  await page.waitForTimeout(500);
  expect(seen.contacted, 'the Operator demo must not contact Supabase').toEqual([]);
  expect(seen.errors, 'no console or page errors').toEqual([]);
});

test('every Operator tab renders, with no error shown', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/index.html');
  await page.locator('#demo-enter button', { hasText: 'Enter as Operator' }).click();
  await page.waitForURL(/operator\.html$/);
  await expect(page.locator('#user-name')).not.toBeEmpty({ timeout: 15_000 });

  const screens = await page.locator('nav.tabs button[data-screen]')
    .evaluateAll((bs) => bs.map((b) => b.getAttribute('data-screen')));
  expect(screens.length, 'the Operator console has its tabs').toBeGreaterThanOrEqual(10);

  for (const name of screens) {
    await page.click(`nav.tabs button[data-screen="${name}"]`);
    await expect(page.locator(`#screen-${name}`), `tab ${name} opens its screen`).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.toast-error'), `tab ${name} shows no error`).toHaveCount(0);
  }
  expect(seen.contacted, 'the tabs must not contact Supabase').toEqual([]);
  expect(seen.errors, 'no console or page errors while going through the tabs').toEqual([]);
});

test('no member page is served by the Operator demo', async ({ request, baseURL }) => {
  for (const page of ['app.html', 'register.html', 'reset.html']) {
    const r = await request.get(new URL(page, baseURL).href);
    expect(r.status(), `${page} is not in the Operator demo`).toBe(404);
  }
});
