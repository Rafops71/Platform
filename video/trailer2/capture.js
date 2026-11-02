#!/usr/bin/env node
/**
 * Real pictures of the app for the new English trailer: sharp (2x) screenshots of Browse with real listings made
 * through the app's own form by throwaway members, exactly as the films do. Nothing is invented on screen: every
 * word is what the app shows. Run on a runner with the live project's secrets (like the films); the throwaway
 * accounts and listings are removed again at the end.
 *
 *   node video/trailer2/capture.js OUTDIR          (needs `node scripts/serve.js` running on :8000)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createAccount, cleanup, assertConfigured } = require('../../tests/e2e/helpers/fixtures');

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const OUT = path.resolve(process.argv[2] || 'capture-out');

async function login(page, who) {
  await page.goto(`${BASE}/index.html`);
  await page.fill('#email', who.email);
  await page.fill('#password', who.password);
  await page.click('#login-btn');
  await page.waitForURL('**/app.html', { timeout: 30000 });
  await page.waitForSelector('#user-name', { timeout: 20000 });
}

async function optionValues(page, sel) {
  return page.$$eval(`${sel} option`, (os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })).filter((o) => o.v));
}

async function postListing(browser, who, spec) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, who);
  await page.click('button[data-screen="new-listing"]');
  await page.check('input[name="type"][value="sell"]');
  const commodities = await optionValues(page, '#commodity-select');
  const origins = await optionValues(page, '#location');
  const commodity = (commodities.find((o) => o.t.toLowerCase() === spec.commodity) || commodities[spec.fallbackCommodity] || commodities[0]).v;
  await page.selectOption('#commodity-select', commodity);
  await page.fill('#quantity', String(spec.quantity));
  await page.selectOption('#unit', { label: 'Metric tons' }).catch(() => {});
  await page.fill('#specification', spec.specification);
  await page.selectOption('#incoterm', spec.incoterm);
  const origin = origins.find((o) => o.t === spec.origin) || origins[spec.fallbackOrigin] || origins[0];
  console.log(`options: ${commodities.length} commodities, ${origins.length} origins`);
  await page.selectOption('#location', origin.v);
  await page.check('#role-principal');
  await page.check(`#kind-${spec.kind}`);
  await page.selectOption('#docs_seen', 'yes');
  await page.selectOption('#docs_showable', 'on_request');
  await page.check('#truth-confirm');
  await page.click('#listing-submit-btn');
  await page.waitForSelector('#listings-container, #my-listings-list .list-row', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await ctx.close();
  console.log(`posted ${spec.commodity} ${spec.quantity} ${spec.incoterm} from ${origin.t}`);
}

(async () => {
  assertConfigured();
  fs.mkdirSync(OUT, { recursive: true });
  const poster1 = await createAccount({ label: 'cap-one', status: 'approved', meta: { first_name: 'Anna', last_name: 'Berg', company: 'Berg Metals' } });
  const poster2 = await createAccount({ label: 'cap-two', status: 'approved', meta: { first_name: 'Karl', last_name: 'Stein', company: 'Stein Trading' } });
  const viewer = await createAccount({ label: 'cap-viewer', status: 'approved', meta: { first_name: 'Ida', last_name: 'Holm', company: 'Holm Group' } });
  const browser = await chromium.launch();
  try {
    await postListing(browser, poster1, { commodity: 'copper cathodes', fallbackCommodity: 0, quantity: 500, specification: 'LME Grade A, 99.99% Cu', incoterm: 'CIF', origin: 'Chile', fallbackOrigin: 0, kind: 'producer' });
    await postListing(browser, poster2, { commodity: 'copper cathodes', fallbackCommodity: 0, quantity: 1200, specification: 'LME Grade A, 99.99% Cu', incoterm: 'FOB', origin: 'Peru', fallbackOrigin: 1, kind: 'trader' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await login(page, viewer);
    await page.click('button[data-screen="browse"]');
    await page.waitForSelector('#screen-browse .list-row, .list-row', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'browse-full.png') });
    await page.screenshot({ path: path.join(OUT, 'browse-top.png'), clip: { x: 100, y: 70, width: 1080, height: 330 } });
    const rows = await page.$$('.list-row');
    console.log(`${rows.length} listing rows on Browse`);
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      await rows[i].scrollIntoViewIfNeeded();
      await rows[i].screenshot({ path: path.join(OUT, `listing-${i}.png`) });
    }
    await ctx.close();
  } finally {
    await browser.close();
    await cleanup();
  }
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
