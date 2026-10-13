#!/usr/bin/env node
'use strict';

// Film the platform, in step with the narration.
//
// HOW THE SYNCHRONISATION WORKS, AND WHY IT IS DONE THIS WAY
//
// video/make-narration.js speaks every line first and writes how long each one
// took into audio/timings.json. This walks the SAME script, and holds each shot
// for exactly that long. Nothing is estimated, so nothing drifts: the film is
// cut to the voice rather than the voice squeezed into the film.
//
// WHAT IT RECORDS AGAINST
//
// Throwaway fixtures on the live project, created and torn down exactly as the
// test suites do - never a real member's data. A film of somebody's actual
// trading would be a privacy breach dressed up as marketing, which on this
// platform of all platforms would be the wrong first impression.
//
//   node video/record.js --film member --lang en
//
// Needs the same .env the browser suites need, and the narration generated
// first so the timings exist.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { overlayScript } = require('./overlay');
const { createAccount, cleanup, assertConfigured } = require('../tests/e2e/helpers/fixtures');
const { query } = require('../scripts/db');

const SCRIPT = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const OUT = path.join(__dirname, 'out');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:8000';

// A pause either side of each line, so the film breathes instead of reading a
// list. The same number make-narration.js budgets with.
const PAUSE = 800;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Move the drawn pointer onto a control, let it land, then press it.
 *
 *  The pause is not decoration: without it the pointer is still travelling
 *  when the page changes, and the film looks like it is being operated by
 *  something invisible rather than by somebody. */
async function pressWithPointer(page, selector) {
  await page.evaluate(s => window.__jericho.moveTo(s), selector);
  await wait(650);
  await page.evaluate(() => window.__jericho.press());
  await wait(200);
  await page.click(selector);
}

/** Type at human speed. A form that fills instantly reads as a recording
 *  played at the wrong rate. */
async function typeSlowly(page, selector, text) {
  await page.evaluate(s => window.__jericho.moveTo(s), selector);
  await wait(400);
  await page.click(selector);
  await page.type(selector, text, { delay: 55 });
}

async function openScreen(page, name) {
  await pressWithPointer(page, `button[data-screen="${name}"]`);
  await page.waitForSelector(`#screen-${name}`, { state: 'visible', timeout: 15000 });
}

/** Everything a scene's `do` can be. Unknown actions fail loudly rather than
 *  silently filming a still screen. */
async function perform(page, action, world) {
  if (!action || action === 'hold') return;

  if (action.startsWith('screen:')) return openScreen(page, action.slice(7));

  switch (action) {
    case 'signIn':
      await page.goto(`${BASE}/index.html`);
      await typeSlowly(page, '#email', world.member.email);
      await typeSlowly(page, '#password', world.member.password);
      await pressWithPointer(page, '#login-btn');
      await page.waitForURL('**/app.html', { timeout: 30000 });
      await page.waitForSelector('#user-name', { timeout: 20000 });
      return;

    case 'fillListing':
      await typeSlowly(page, '#quantity', '25000');
      await typeSlowly(page, '#origin', 'Chile');
      await typeSlowly(page, '#specification', 'LME Grade A, 99.99% Cu');
      return;

    case 'saveSearch':
      await pressWithPointer(page, '#browse-save-search-btn');
      return;

    case 'openContact':
      await pressWithPointer(page, '[data-contact]');
      await page.waitForSelector('#contact-modal', { state: 'visible', timeout: 15000 });
      await typeSlowly(page, '#contact-body',
        'Interested in this parcel. Please pass my enquiry to the seller.');
      return;

    case 'sendContact':
      await pressWithPointer(page, '#contact-send-btn');
      await page.waitForSelector('#contact-modal', { state: 'hidden', timeout: 20000 });
      return;

    case 'switchLanguage':
      await pressWithPointer(page, '.lang-toggle .lang-btn:not(.active)');
      return;

    default:
      throw new Error(`video/script.json asks for an action nobody wrote: "${action}"`);
  }
}

async function main() {
  assertConfigured();
  const film = arg('film', 'member');
  const lang = arg('lang', 'en');
  const scenes = SCRIPT.films[film].scenes;

  const timingsPath = path.join(__dirname, 'audio', 'timings.json');
  if (!fs.existsSync(timingsPath)) {
    throw new Error('No audio/timings.json. Run video/make-narration.js first - the film is cut to the voice, so the voice has to exist.');
  }
  const timings = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));

  console.log(`Filming "${film}" in ${lang}: ${scenes.length} scenes.`);
  await cleanup();

  const world = {};
  world.member = await createAccount({
    label: 'film', role: 'participant', status: 'approved',
    meta: { first_name: 'Ingrid', last_name: 'Solberg', company: 'Solberg Metals' },
  });
  const other = await createAccount({
    label: 'film-other', role: 'participant', status: 'approved',
    meta: { first_name: 'Marco', last_name: 'Ferrari', company: 'Ferrari Commodities' },
  });
  await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, specification,
        status, reference_number)
     values ($1, 'sell', 'Copper Cathode Grade A', 25000, 'Metric tons', 'CIF', 'Chile',
             'LME Grade A, 99.99% Cu', 'available', $2)`,
    [other.profileId, `SELL-FILM-${Date.now().toString().slice(-6)}`]
  );

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    locale: lang === 'es' ? 'es-ES' : 'en-GB',
  });

  // The overlay has to exist before any of the page's own scripts run, and
  // again after every navigation - addInitScript does both.
  await context.addInitScript(overlayScript);
  const page = await context.newPage();

  if (lang === 'es') {
    await page.goto(`${BASE}/index.html`);
    await page.evaluate(() => { try { localStorage.setItem('jericho.language', 'es'); } catch (e) {} });
  }

  for (const scene of scenes) {
    const seconds = timings[`${film}-${lang}-${scene.id}`];
    if (!seconds) throw new Error(`no narration timing for ${film}-${lang}-${scene.id}`);

    await page.evaluate(t => window.__jericho.caption(t), scene.say[lang]);
    await perform(page, scene.do, world);
    if (scene.highlight) {
      await page.evaluate(s => window.__jericho.ringAround(s), scene.highlight).catch(() => {});
    } else {
      await page.evaluate(() => window.__jericho.ringAround(null)).catch(() => {});
    }

    // The shot is held for exactly as long as the line takes to speak. Any
    // time the actions above already consumed is time the viewer spent
    // watching the thing being described, so it counts.
    console.log(`  ${scene.id.padEnd(14)} holding ${seconds.toFixed(2)}s`);
    await wait(Math.round(seconds * 1000) + PAUSE);
  }

  await page.evaluate(() => window.__jericho.caption(''));
  await wait(600);

  const video = page.video();
  await context.close();
  const raw = await video.path();
  const final = path.join(OUT, `${film}-${lang}.webm`);
  fs.renameSync(raw, final);
  await browser.close();

  await cleanup();
  console.log(`\nFilmed: ${final}`);
}

main().catch(async (err) => {
  console.error('\nThe recording failed:', err.message);
  try { await cleanup(); } catch { /* teardown is best effort on a failure */ }
  process.exit(1);
});
