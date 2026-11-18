// Item 80 (owner's decision 41, 2026-11-04): the Member walkthrough film sits on the
// app's sign-in page, BELOW the sign-in box. English shows the English film,
// Spanish the Spanish one, and it swaps when the language changes. It plays on
// press only. The Operator's film is never on this page.
//
// Written in the same change as the feature. Not yet run against the live site.

'use strict';

const { test, expect } = require('@playwright/test');

test('Item80 the member walkthrough sits below the sign-in box, in English and Spanish, play on press', async ({ page }) => {
  await page.goto('/index.html');

  const video = page.locator('#walkthrough-video');
  await expect(video).toBeVisible();

  // English is the default: the English film is named, and it is served.
  await expect(video).toHaveAttribute('src', 'films/walkthrough-member-en.mp4');
  const en = await page.request.get(new URL('films/walkthrough-member-en.mp4', page.url()).href);
  expect(en.status()).toBe(200);

  // Plays on press only: nothing starts by itself.
  await page.waitForTimeout(1500);
  expect(await video.evaluate((v) => v.autoplay)).toBe(false);
  expect(await video.evaluate((v) => v.paused)).toBe(true);
  expect(await video.getAttribute('controls')).not.toBeNull();

  // Below the sign-in box, not above or beside it.
  const formBox = await page.locator('#login-form').boundingBox();
  const filmBox = await video.boundingBox();
  expect(filmBox.y).toBeGreaterThan(formBox.y + formBox.height);

  // Switching to Spanish swaps the film, and it is served too.
  await page.locator('#lang-toggle .lang-btn', { hasText: 'ES' }).click();
  await expect(video).toHaveAttribute('src', 'films/walkthrough-member-es.mp4');
  const es = await page.request.get(new URL('films/walkthrough-member-es.mp4', page.url()).href);
  expect(es.status()).toBe(200);

  // And back to English.
  await page.locator('#lang-toggle .lang-btn', { hasText: 'EN' }).click();
  await expect(video).toHaveAttribute('src', 'films/walkthrough-member-en.mp4');
});
