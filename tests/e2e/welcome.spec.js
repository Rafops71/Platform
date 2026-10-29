// The welcome page (sql/044): shown once, at a member's first sign-in, in
// their own language, with the dashboard hidden behind it until they press
// "I understand - continue". Never shown again afterwards.
//
// Fixture accounts are created as "already seen it" so that no other test
// meets this page; these two are created as new members.

'use strict';

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, signOut, pagePattern } = require('./helpers/session');
const { query } = require('../../scripts/db');

let english, spanish;

test.beforeAll(async () => {
  assertConfigured();
  await cleanup();
  english = await createAccount({ label: 'welcomeen', welcomeSeen: false });
  spanish = await createAccount({ label: 'welcomees', welcomeSeen: false });
  await query(`update public.profiles set language = 'es' where email = $1`, [spanish.email]);
});

test.afterAll(async () => { await cleanup(); });

// Signed in by hand: the shared signIn() presses the welcome button for the
// test, which is exactly the step being tested here.
async function firstSignIn(page, account) {
  await page.goto('/index.html');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('#login-btn');
  await page.waitForURL(pagePattern('app.html'), { timeout: 30_000 });
}

async function seenAt(account) {
  const { rows } = await query('select welcome_seen_at from public.profiles where email = $1', [account.email]);
  return rows[0].welcome_seen_at;
}

test.describe.serial('welcome page', () => {

  test('Item77 a new member sees the welcome page once, at their first sign-in', async ({ page }) => {
    await firstSignIn(page, english);

    const gate = page.locator('#welcome-gate');
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await expect(gate.locator('h2')).toHaveText('Welcome to MyPlatform');
    for (const label of ['What we do:', 'Our role:', 'Your role:', 'Trust:', 'Consequences:', 'Your account:']) {
      await expect(gate).toContainText(label);
    }
    await expect(gate).toContainText('your account is personal and for your sole use.');
    await expect(page.locator('nav.tabs'), 'the dashboard is hidden behind the welcome page').toBeHidden();
    expect(await seenAt(english), 'recorded as seen before the member pressed anything').toBeNull();

    await page.click('#welcome-continue');
    await expect(gate).toBeHidden();
    await expect(page.locator('nav.tabs')).toBeVisible();
    await expect(page.locator('#user-name')).not.toBeEmpty();
    await expect.poll(() => seenAt(english), { timeout: 15_000 }).not.toBeNull();

    // The second sign-in goes straight to the dashboard.
    await signOut(page);
    await signIn(page, english, 'app.html');
    await expect(gate, 'the welcome page came back on a second sign-in').toBeHidden();
  });

  test('Item77 the welcome page is in the member\'s own language', async ({ page }) => {
    await firstSignIn(page, spanish);

    const gate = page.locator('#welcome-gate');
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await expect(gate.locator('h2')).toHaveText('Le damos la bienvenida a MyPlatform');
    await expect(page.locator('#welcome-continue')).toHaveText('Lo entiendo – continuar');
    await expect(gate).toContainText('Su cuenta:');
  });
});
