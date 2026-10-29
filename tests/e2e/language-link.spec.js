// A visitor who chose Spanish on the front page (www.myplatform.trade) and
// clicks "Acceso de miembros" must land in the app in Spanish.
//
// The front page links to the app as /?lang=es, and js/i18n.js adopts that
// into storage. Four things have to hold: the link is honoured, it STAYS
// honoured after the app moves the visitor on (the query string does not
// survive a redirect, the stored choice does), a language the app does not
// support is ignored, and the front page's button follows its own switch.
// No account or database is involved.

'use strict';

const path = require('path');
const { test, expect } = require('@playwright/test');

const FRONT_PAGE = 'file://' + path.join(__dirname, '..', '..', 'www', 'index.html');

test.describe('the language travels in the link', () => {
  test('?lang=es opens the sign-in page in Spanish', async ({ page }) => {
    await page.goto('/index.html?lang=es');
    await expect(page.locator('#login-btn')).toHaveText('Iniciar sesión');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('the choice survives the next page, where the query string is gone', async ({ page }) => {
    await page.goto('/index.html?lang=es');
    await page.goto('/reset.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await page.evaluate(() => localStorage.getItem('jericho.language'))).toBe('es');
  });

  test('?lang=en overrides an earlier Spanish choice', async ({ page }) => {
    await page.goto('/index.html?lang=es');
    await page.goto('/index.html?lang=en');
    await expect(page.locator('#login-btn')).toHaveText('Sign In');
  });

  test('an unsupported language is ignored', async ({ page }) => {
    await page.goto('/index.html?lang=xx');
    await expect(page.locator('#login-btn')).toHaveText('Sign In');
    expect(await page.evaluate(() => localStorage.getItem('jericho.language'))).toBeNull();
  });

  test('the front page button carries the language chosen on the front page', async ({ page }) => {
    await page.goto(FRONT_PAGE);
    await expect(page.locator('#signin')).toHaveAttribute('href', 'https://app.myplatform.trade/?lang=en');
    await page.getByRole('button', { name: 'ES' }).click();
    await expect(page.locator('#signin')).toHaveAttribute('href', 'https://app.myplatform.trade/?lang=es');
    await expect(page.locator('#signin')).toHaveText('Acceso de miembros');
  });

  test('the front page shows the name MyPlatform above the headline, the same in both languages', async ({ page }) => {
    await page.goto(FRONT_PAGE);
    const title = page.locator('.title');
    await expect(title).toHaveText('MyPlatform');
    const above = async () => (await title.boundingBox()).y < (await page.locator('h1').boundingBox()).y;
    expect(await above(), 'the name is not above the headline').toBe(true);
    await page.getByRole('button', { name: 'ES' }).click();
    await expect(page.locator('h1')).toHaveText('Donde la oportunidad se encuentra con la discreción.');
    await expect(title).toHaveText('MyPlatform');
    expect(await above()).toBe(true);
  });
});
