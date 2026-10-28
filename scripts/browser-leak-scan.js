// The browser leak scan: everything a member's browser receives or keeps,
// searched for another member's identity.
//
// Asked for on 2026-10-28 (docs/AGREED-2026-10-25.md, review Block 2).
// scripts/identity-scan.js asks every table and function directly; this asks
// what the real pages actually pull down when used. On staging, member A and
// member B each sign in, in a real browser, and open every dashboard tab in
// both languages. Every answer the browser downloads, plus what the page
// leaves in localStorage, sessionStorage, cookies and on screen, is searched
// for the other members' names, surnames, companies, phones and emails.
//
// Random profile ids are not searched for: they name nobody, and one travels
// with a forwarded message by the owner's decision (HANDOFF.md, parked
// 2026-10-19; scripts/identity-scan.js holds that exception exactly).
//
// Refuses the live project.

const pw = require('playwright');
const { buildWorld, cleanup, guardNotLive } = require('./security-grid');
const { serve, waitForServer, newPage, signIn } = require('./browser-crawl');

const KINDS = ['email', 'first_name', 'last_name', 'phone', 'company'];

async function scan(browser, who, others, findings) {
  const page = await newPage(browser, who.label);
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push({ url: res.url(), text: await res.text() }); } catch { /* redirects, aborted */ }
  });
  await signIn(page, who, 'app.html');
  const tabs = await page.$$eval('nav.tabs button', (bs) => bs.map((b) => b.dataset.screen).filter(Boolean));
  for (const lang of ['EN', 'ES']) {
    const btn = page.locator('.lang-btn', { hasText: lang });
    if (await btn.count()) await btn.first().click();
    for (const tab of tabs) {
      await page.click(`nav.tabs button[data-screen="${tab}"]`);
      await page.waitForLoadState('networkidle');
    }
  }
  const kept = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }),
    cookies: document.cookie, screen: document.body.innerText,
  }));
  const cookies = JSON.stringify(await page.context().cookies());
  const places = [
    ...bodies.map((b) => ({ where: `download ${b.url.replace(/\?.*/, '')}`, text: b.text })),
    { where: 'localStorage', text: kept.local }, { where: 'sessionStorage', text: kept.session },
    { where: 'cookies', text: kept.cookies + cookies }, { where: 'the screen', text: kept.screen },
  ];
  for (const other of others) {
    for (const k of KINDS) {
      const v = other.identity[k];
      if (!v || v.length < 6) continue;
      for (const p of places) if (p.text.toLowerCase().includes(v.toLowerCase())) findings.push(`${who.label}'s browser got ${other.label}'s ${k} - ${p.where}`);
    }
  }
  await page.context().close();
  return { downloads: bodies.length, tabs: tabs.length };
}

async function main() {
  guardNotLive();
  const server = serve();
  const findings = [];
  let browser;
  const counts = [];
  try {
    await waitForServer();
    const w = await buildWorld();
    browser = await pw.chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
    const others = (me) => [w.A, w.B, w.pending, w.suspended].filter((x) => x !== me);
    for (const who of [w.A, w.B]) counts.push(await scan(browser, who, others(who), findings));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await cleanup();
  }
  console.log(`Browser leak scan: members A and B, ${counts.map((c) => `${c.tabs} tabs, ${c.downloads} downloads`).join('; ')}.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of [...new Set(findings)]) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - no member\'s browser received or kept another member\'s identity.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
