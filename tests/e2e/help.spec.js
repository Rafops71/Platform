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

  // MyPlatform's role, who answers for an offer, account sharing - and the
  // catch-all stays the last question.
  await expect(items.nth(13).locator('summary')).toHaveText('What is MyPlatform’s role?');
  await expect(items.nth(14).locator('summary')).toHaveText('Who is responsible for what an offer says?');
  await expect(items.nth(15).locator('summary')).toHaveText('Can someone else use my account?');
  await expect(items.nth(16).locator('summary')).toHaveText('Something else is not clear.');

  const english = [];
  for (let i = 0; i < 17; i += 1) english.push(await items.nth(i).locator('summary').innerText());

  await page.locator('.lang-btn', { hasText: 'ES' }).click();
  await expect(items).toHaveCount(17);
  await expect(items.nth(13).locator('summary')).toHaveText('¿Cuál es el papel de MyPlatform?');
  await expect(items.nth(15).locator('summary')).toHaveText('¿Puede otra persona usar mi cuenta?');
  await expect(items.nth(16).locator('summary')).toHaveText('Hay algo más que no está claro.');
  await expect(items.first().locator('summary')).toHaveText('¿Cómo funciona MyPlatform?');
  // EVERY question, in Spanish: present, not a raw key, and not left in English.
  for (let i = 0; i < 17; i += 1) {
    const q = items.nth(i).locator('summary');
    await expect(q).not.toHaveText(/^help\./);
    await expect(q).not.toHaveText(english[i]);
    await expect(items.nth(i).locator('p')).not.toHaveText(/^help\./);
  }
  await expect(items.nth(14).locator('summary')).toHaveText('¿Quién es responsable de lo que dice una oferta?');
});
