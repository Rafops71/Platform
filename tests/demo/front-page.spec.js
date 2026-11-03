// Tests for the FRONT PAGE (www/), served on its own by playwright.demo.config.js.
// The trailer sits under the MyPlatform title, follows the language (English or
// Spanish film), and never autoplays. Both films must be served.

'use strict';

const { test, expect } = require('@playwright/test');

const FRONT = `http://127.0.0.1:${process.env.FRONT_PORT || 8210}`;

async function trailerSrc(page) {
  return page.locator('video.trailer').evaluate((v) => v.getAttribute('src'));
}

test.describe('front page trailer', () => {
  test('English by default, Spanish after ES; both films served; no autoplay; under the title', async ({ page, request }) => {
    await page.goto(`${FRONT}/index.html`);
    const video = page.locator('video.trailer');
    await expect(video, 'one trailer on the front page').toHaveCount(1);
    expect(await video.getAttribute('autoplay'), 'no autoplay').toBeNull();

    // Under the MyPlatform title, above the headline.
    const order = await page.evaluate(() => {
      const title = document.querySelector('p.title');
      const v = document.querySelector('video.trailer');
      const h1 = document.querySelector('h1');
      return !!(title && v && h1 && (title.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (v.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order, 'the trailer is under the title and above the headline').toBe(true);

    expect(await trailerSrc(page), 'English by default').toBe('films/trailer-en.mp4');
    expect((await request.get(`${FRONT}/films/trailer-en.mp4`)).status(), 'EN film resolves').toBe(200);
    expect((await request.get(`${FRONT}/films/trailer-en-poster.jpg`)).status(), 'EN poster resolves').toBe(200);

    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect.poll(() => trailerSrc(page), { message: 'Spanish after ES' }).toBe('films/trailer-es.mp4');
    expect((await request.get(`${FRONT}/films/trailer-es.mp4`)).status(), 'ES film resolves').toBe(200);
    expect((await request.get(`${FRONT}/films/trailer-es-poster.jpg`)).status(), 'ES poster resolves').toBe(200);
    expect(await video.getAttribute('autoplay'), 'still no autoplay after the swap').toBeNull();

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect.poll(() => trailerSrc(page), { message: 'English again after EN' }).toBe('films/trailer-en.mp4');
  });
});
