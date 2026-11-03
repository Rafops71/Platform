#!/usr/bin/env node
/**
 * Real pictures of the app IN SPANISH for the Spanish trailer (same offer: copper cathodes, South Africa, CIF) (copper cathodes, South Africa, CIF; Browse filtered to it; the Contact window; the Mailbox): sharp (2x) screenshots of Browse with real listings made
 * through the app's own form by throwaway members, exactly as the films do. Nothing is invented on screen: every
 * word is what the app shows. Run on a runner with the live project's secrets (like the films); the throwaway
 * accounts and listings are removed again at the end.
 *
 *   node video/storyboard10/capture.js OUTDIR          (needs `node scripts/serve.js` running on :8000)
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
  await page.waitForFunction(() => document.querySelectorAll('#commodity-select option').length > 5, null, { timeout: 20000 });
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
  const poster = await createAccount({ label: 'sb-poster', status: 'approved', meta: { first_name: 'Anna', last_name: 'Berg', company: 'Berg Metals' } });
  const viewer = await createAccount({ label: 'sb-viewer', status: 'approved', meta: { first_name: 'Ida', last_name: 'Holm', company: 'Holm Group' } });
  const browser = await chromium.launch();
  const meta = {};
  try {
    await postListing(browser, poster, { commodity: 'copper cathodes', fallbackCommodity: 0, quantity: 500, specification: 'LME Grade A, 99.99% Cu', incoterm: 'CIF', origin: 'South Africa', fallbackOrigin: 0, kind: 'trader' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('jericho.language', 'es'); } catch (e) { /* not fatal */ } });
    const page = await ctx.newPage();
    const spots = () => page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
        if (!/operadores/i.test(own)) continue;
        const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        if (cs.visibility === 'hidden' || cs.display === 'none' || b.width < 2 || b.height < 2) continue;
        out.push({ text: own.trim(), x: b.x, y: b.y, w: b.width, h: b.height });
      }
      return out;
    });
    await login(page, viewer);
    // Not part of the story, so not shown: the member's own name in the header, the line about uploaded files (it reads
    // as the opposite of the poster's statement) and the two plural sentences about "Operators".
    await page.addStyleTag({ content: '#user-name{visibility:hidden} .list-row-meta strong{visibility:hidden} [data-i18n="contact.intro"],[data-i18n="mailbox.intro"]{visibility:hidden}' });
    await page.click('button[data-screen="browse"]');
    await page.waitForSelector('#browse-list .list-row', { timeout: 20000 });
    const commodities = await optionValues(page, '#browse-filter-commodity');
    const regions = await optionValues(page, '#browse-filter-region');
    const c = commodities.find((o) => /copper cathodes|c[aá]todos? de cobre/i.test(o.t));
    const r = regions.find((o) => /south africa|sud[aá]frica/i.test(o.t));
    console.log(`filter options: commodity ${c ? c.t : 'MISSING'}, region ${r ? r.t : 'MISSING'}`);
    if (c) await page.selectOption('#browse-filter-commodity', c.v);
    if (r) await page.selectOption('#browse-filter-region', r.v);
    await page.click('#browse-refresh-btn');
    await page.waitForTimeout(2000);
    const rows = await page.$$('#browse-list .list-row');
    console.log(`${rows.length} row(s) after the filter`);
    const bb = async (sel) => { const b = await (await page.$(sel)).boundingBox(); return b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
    meta.row = await bb('#browse-list .list-row');
    meta.contactBtn = await bb('#browse-list .list-row button');
    meta.pluralBrowse = await spots();
    await page.screenshot({ path: path.join(OUT, 'browse.png') });
    await rows[0].screenshot({ path: path.join(OUT, 'row.png') });
    await page.click('#browse-list .list-row button');
    await page.waitForSelector('#contact-modal:not(.hidden)');
    await page.fill('#contact-body', 'We are interested in this parcel. Please confirm that it is still available.');
    meta.contactSend = await bb('#contact-send-btn');
    meta.pluralContact = await spots();
    await page.screenshot({ path: path.join(OUT, 'contact.png') });
    await page.click('#contact-send-btn');
    await page.waitForTimeout(1200);
    await page.click('button[data-screen="mailbox"]');
    await page.waitForTimeout(2000);
    meta.pluralMailbox = await spots();
    await page.screenshot({ path: path.join(OUT, 'mailbox.png') });
    fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
    await ctx.close();
  } finally {
    await browser.close();
    await cleanup();
  }
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
