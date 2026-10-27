// The browser crawl: every page and every screen, in a real browser, on the
// staging project.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"): "click
// everything", plus accessibility and a second browser engine. The site is
// served from this checkout and its Supabase settings (js/supabase-config.js)
// are answered with STAGING's, so the real pages run against the test copy
// and never touch the live database.
//
// As a stranger, a member and an Operator it opens every page, then every tab
// of both dashboards, in both languages, and fails on:
//   - any uncaught script error or console error;
//   - a tab that does not open its screen when clicked;
//   - a screen still saying "Loading" after ten seconds.
// Only navigation is clicked - tabs and the language switch. Nothing that
// sends, saves or deletes is pressed: exploring must not change anything.
//
// Accessibility (axe-core 4.10.2, loaded from jsDelivr) runs on every screen
// visited. Its "critical" findings fail the run; the rest are listed, because
// they are quality targets to work through, not proof that something is
// unsafe.
//
//   BROWSER=chromium|firefox|webkit node scripts/browser-crawl.js
//
// Refuses the live project (through scripts/security-grid.js).

const path = require('path');
const { spawn } = require('child_process');
const pw = require('playwright');
const { buildWorld, cleanup, guardNotLive } = require('./security-grid');

const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const AXE = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js';
const STAGING_CONFIG = `
const SUPABASE_URL = ${JSON.stringify(process.env.SUPABASE_URL)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(process.env.SUPABASE_ANON_KEY)};
const jericho = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
`;

const findings = [];
const a11yNotes = new Map();
let axeSource = null;

function serve() {
  const proc = spawn(process.execPath, [path.join(__dirname, 'serve.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore',
  });
  return proc;
}

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASE}/index.html`)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the local server never started');
}

async function newPage(browser, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/js/supabase-config.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: STAGING_CONFIG }));
  page.on('pageerror', (err) => findings.push(`${label}: script error on ${page.url()}: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The app logs a refused request deliberately (js/utils.js errorMessage)
    // and the browser reports 4xx answers it was expected to get; neither is
    // a fault. Anything else is.
    if (/^\[jericho\]|Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    // Firefox reports a font download it cancelled itself (NS_BINDING_ABORTED,
    // 2152398850) when a signed-out visitor is sent away mid-load. Not a fault.
    if (/downloadable font: download failed .*status=2152398850/.test(text)) return;
    findings.push(`${label}: console error on ${page.url()}: ${text.slice(0, 200)}`);
  });
  return page;
}

async function accessibility(page, where) {
  if (!axeSource) axeSource = await (await fetch(AXE)).text();
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 10) }));
  });
  for (const v of result) {
    if (v.impact === 'critical') findings.push(`${where}: accessibility (critical) - ${v.help} [${v.id}]: ${v.targets.join(', ')}`);
    else {
      const key = `${v.impact} - ${v.help} [${v.id}]`;
      a11yNotes.set(key, (a11yNotes.get(key) || new Set()).add(where));
    }
  }
}

async function noStuckLoading(page, where) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const stuck = await page.evaluate(() => [...document.querySelectorAll('.screen.active, body')]
      .some((el) => el.offsetParent !== null || el === document.body
        ? /\bLoading…|\bLoading\.\.\.|\bCargando/.test(el.innerText) : false));
    if (!stuck) return;
    if (Date.now() > deadline) { findings.push(`${where}: still "Loading" after 10 s`); return; }
    await page.waitForTimeout(250);
  }
}

async function crawlDashboard(page, label, file) {
  const tabs = await page.$$eval('nav.tabs button', (bs) => bs.map((b) => b.dataset.screen).filter(Boolean));
  if (!tabs.length) findings.push(`${label}: ${file} shows no tabs at all`);
  for (const lang of ['EN', 'ES']) {
    const btn = page.locator('.lang-btn', { hasText: lang });
    if (await btn.count()) await btn.first().click();
    for (const tab of tabs) {
      const where = `${label} ${file} [${tab}] (${lang})`;
      await page.click(`nav.tabs button[data-screen="${tab}"]`);
      const open = await page.locator(`#screen-${tab}`).evaluate((el) => el.classList.contains('active'));
      if (!open) { findings.push(`${where}: clicking the tab did not open its screen`); continue; }
      await noStuckLoading(page, where);
      if (lang === 'EN') await accessibility(page, where);
    }
  }
  return tabs.length;
}

async function signIn(page, who, expected) {
  await page.goto(`${BASE}/index.html`);
  await page.fill('#email', who.email);
  await page.fill('#password', who.password);
  await page.click('#login-btn');
  await page.waitForURL(`**/${expected}`, { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('#user-name')?.textContent.trim().length > 0, null, { timeout: 20_000 });
}

async function main() {
  guardNotLive();
  const engine = process.env.BROWSER || 'chromium';
  const server = serve();
  let browser;
  let screens = 0;
  try {
    await waitForServer();
    const w = await buildWorld();
    // PW_EXECUTABLE: a browser already on the machine, for running this outside CI.
    browser = await pw[engine].launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});

    // A stranger: every public page.
    const stranger = await newPage(browser, 'stranger');
    for (const file of ['index.html', 'register.html', 'reset.html', 'terms.html']) {
      await stranger.goto(`${BASE}/${file}`);
      await stranger.waitForLoadState('networkidle');
      await noStuckLoading(stranger, `stranger ${file}`);
      await accessibility(stranger, `stranger ${file}`);
      screens += 1;
    }
    // A stranger going straight to a dashboard is sent to sign in.
    for (const file of ['app.html', 'operator.html']) {
      await stranger.goto(`${BASE}/${file}`);
      await stranger.waitForURL('**/index.html**', { timeout: 15_000 })
        .catch(() => findings.push(`stranger: ${file} did not send a signed-out visitor to sign in`));
    }

    const member = await newPage(browser, 'member');
    await signIn(member, w.A, 'app.html');
    screens += await crawlDashboard(member, 'member', 'app.html');

    const operator = await newPage(browser, 'operator');
    await signIn(operator, w.operator, 'operator.html');
    screens += await crawlDashboard(operator, 'operator', 'operator.html');
  } finally {
    if (browser) await browser.close();
    server.kill();
    await cleanup();
  }

  console.log(`Browser crawl (${engine}): ${screens} pages and screens, as a stranger, a member and an Operator, in English and Spanish.`);
  if (a11yNotes.size) {
    console.log(`\nAccessibility to improve (not failing the run): ${a11yNotes.size} kind(s)`);
    for (const [k, where] of a11yNotes) console.log(`  - ${k} on ${where.size} screen(s)`);
  }
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of [...new Set(findings)]) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nPASS - no script errors, every tab opened, nothing stuck loading, no critical accessibility fault.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
