// The Help questions (js/help.js): readable before signing in, from the
// sign-in page, in both languages. Inside the platform the same questions are
// the member's Help tab, and the Operator has his own; the browser crawl and
// the picture check open both.

const { test, expect } = require('@playwright/test');
const { pagePattern } = require('./helpers/session');

test('Item76 Help answers the common questions in English and Spanish, before signing in', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('a[href="help.html"]');
  await expect(page).toHaveURL(pagePattern('help.html'));

  const items = page.locator('#help-list details.help-item');
  await expect(items).toHaveCount(14);
  await expect(items.first().locator('summary')).toHaveText('How does MyPlatform work?');
  await expect(items.first().locator('p')).toBeHidden();
  await items.first().locator('summary').click();
  await expect(items.first().locator('p')).toContainText('Nobody contacts anybody directly');

  await page.locator('.lang-btn', { hasText: 'ES' }).click();
  await expect(items).toHaveCount(14);
  await expect(items.first().locator('summary')).toHaveText('¿Cómo funciona MyPlatform?');
  for (let i = 0; i < 14; i += 1) {
    await expect(items.nth(i).locator('summary')).not.toHaveText(/^help\./);
  }
});
