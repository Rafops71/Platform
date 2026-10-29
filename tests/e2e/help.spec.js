// The Help questions (js/help.js): readable before signing in, from the
// sign-in page, in both languages. Inside the platform the same questions are
// the member's Help tab, and the Operator has his own; the browser crawl and
// the picture check open both.

const { test, expect } = require('@playwright/test');
const { pagePattern } = require('./helpers/session');

test('Item76 Help answers the common questions in English and Spanish, before signing in', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('a[href="help.html"]');
  await expect(page).toHaveURL(pagePattern('help.html', { after: 'any' }));

  const items = page.locator('#help-list details.help-item');
  await expect(items).toHaveCount(17);
  await expect(items.first().locator('summary')).toHaveText('How does MyPlatform work?');
  await expect(items.first().locator('p')).toBeHidden();
  await items.first().locator('summary').click();
  await expect(items.first().locator('p')).toContainText('Nobody contacts anybody directly');

  // The last three: MyPlatform's role, who answers for an offer, account sharing.
  await expect(items.nth(14).locator('summary')).toHaveText('What is MyPlatform’s role?');
  await expect(items.nth(15).locator('summary')).toHaveText('Who is responsible for what an offer says?');
  await expect(items.nth(16).locator('summary')).toHaveText('Can someone else use my account?');

  await page.locator('.lang-btn', { hasText: 'ES' }).click();
  await expect(items).toHaveCount(17);
  await expect(items.nth(14).locator('summary')).toHaveText('¿Cuál es el papel de MyPlatform?');
  await expect(items.nth(16).locator('summary')).toHaveText('¿Puede otra persona usar mi cuenta?');
  await expect(items.first().locator('summary')).toHaveText('¿Cómo funciona MyPlatform?');
  for (let i = 0; i < 17; i += 1) {
    await expect(items.nth(i).locator('summary')).not.toHaveText(/^help\./);
  }
});
