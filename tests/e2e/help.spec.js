// The Help questions (js/help.js): available only inside the platform, after
// sign-in, as the member's Help tab. They are never on the sign-in page or the
// start page (index.html), and there is no public Help page.

const { test, expect } = require('@playwright/test');
const { createAccount, cleanup, assertConfigured } = require('./helpers/fixtures');
const { signIn, openScreen } = require('./helpers/session');

// Sixteen questions. The document-request question was removed with the
// Operator's document requests (owner's decision, items 36-37), so the list
// shrank from seventeen and the positions below moved up by one.
const COUNT = 16;

let member;

test.beforeAll(async () => {
  assertConfigured();
  member = await createAccount({ label: 'helpitem', role: 'participant', status: 'approved' });
});

test.afterAll(async () => { await cleanup(); });

test('Item76 Help questions are available only after sign-in, never on the sign-in or start pages', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('a[href="help.html"]')).toHaveCount(0);
  await expect(page.locator('#help-list')).toHaveCount(0);

  await signIn(page, member);
  await openScreen(page, 'help');

  const items = page.locator('#help-list details.help-item');
  await expect(items).toHaveCount(COUNT);
  await expect(items.first().locator('summary')).toHaveText('How does MyPlatform work?');
  await expect(items.first().locator('p')).toBeHidden();
  await items.first().locator('summary').click();
  await expect(items.first().locator('p')).toContainText('Nobody contacts anybody directly');

  // MyPlatform's role, who answers for an offer, account sharing - and the
  // catch-all stays the last question.
  await expect(items.nth(12).locator('summary')).toHaveText('What is MyPlatform’s role?');
  await expect(items.nth(13).locator('summary')).toHaveText('Who is responsible for what an offer says?');
  await expect(items.nth(14).locator('summary')).toHaveText('Can someone else use my account?');
  await expect(items.nth(15).locator('summary')).toHaveText('Something else is not clear.');

  const english = [];
  for (let i = 0; i < COUNT; i += 1) english.push(await items.nth(i).locator('summary').innerText());

  await page.locator('.lang-btn', { hasText: 'ES' }).click();
  await expect(items).toHaveCount(COUNT);
  await expect(items.nth(12).locator('summary')).toHaveText('¿Cuál es el papel de MyPlatform?');
  await expect(items.nth(14).locator('summary')).toHaveText('¿Puede otra persona usar mi cuenta?');
  await expect(items.nth(15).locator('summary')).toHaveText('Hay algo más que no está claro.');
  await expect(items.first().locator('summary')).toHaveText('¿Cómo funciona MyPlatform?');
  // EVERY question, in Spanish: present, not a raw key, and not left in English.
  for (let i = 0; i < COUNT; i += 1) {
    const q = items.nth(i).locator('summary');
    await expect(q).not.toHaveText(/^help\./);
    await expect(q).not.toHaveText(english[i]);
    await expect(items.nth(i).locator('p')).not.toHaveText(/^help\./);
  }
  await expect(items.nth(13).locator('summary')).toHaveText('¿Quién es responsable de lo que dice una oferta?');
});
