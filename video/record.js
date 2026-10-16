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
const PAUSE = Math.round(SCRIPT.pacing.pauseSeconds * 1000);
// Long enough for the .85s zoom transition in video/overlay.js to finish, so
// no shot is held while the page is still moving.
const ZOOM_SETTLE = 1000;  // from script.json, so assemble.js holds the same gap

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
  // .first(): a selector that matches several controls - every Browse row has
  // a Contact button - must press one rather than refuse. Playwright's own
  // ">> nth=0" syntax cannot be used here, because the same selector is
  // handed to document.querySelector in the overlay, which only understands
  // plain CSS. That mismatch is what failed the second filming attempt.
  await page.locator(selector).first().click();
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

/** Everything a scene's `do` can be.
 *
 *  The verbs are generic and take their target and their value FROM THE
 *  SCRIPT, so a film is written in script.json rather than in here. The
 *  previous version had a `fillListing` verb with the commodity, the quantity
 *  and the country baked into it, which meant the film's content lived in two
 *  files and the narration could describe values the recorder never used.
 *
 *  Unknown actions throw rather than filming a still screen.
 *
 *    hold                  do nothing; let the voice talk over the shot
 *    screen:<name>         press a nav button and wait for that screen
 *    press:<selector>      point at it, press it, click it
 *    type:<selector>|<text>  type at human speed
 *    select:<selector>|<value>   choose from a <select>
 *    check:<selector>      tick a radio or checkbox
 *    language              switch to the other language
 *    signIn                fill the sign-in form and wait for the app
 */
async function perform(page, action, world) {
  if (!action || action === 'hold') return;

  const [verb, rest] = [action.slice(0, action.indexOf(':')) || action,
                        action.slice(action.indexOf(':') + 1)];
  const [target, value] = String(rest).split('|');

  switch (verb) {
    case 'screen':
      await pressWithPointer(page, `button[data-screen="${rest}"]`);
      await page.waitForSelector(`#screen-${rest}`, { state: 'visible', timeout: 15000 });
      return;

    case 'press':
      await pressWithPointer(page, target);
      return;

    case 'type':
      await typeSlowly(page, target, value);
      return;

    case 'select':
      // The pointer is moved first so the viewer sees WHERE the choice is
      // being made; selectOption itself draws nothing.
      await page.evaluate(sel => window.__jericho.moveTo(sel), target);
      await wait(400);
      await page.selectOption(target, value);
      await page.evaluate(() => window.__jericho.press());
      return;

    case 'check':
      await page.evaluate(sel => window.__jericho.moveTo(sel), target);
      await wait(400);
      await page.locator(target).check();
      await page.evaluate(() => window.__jericho.press());
      return;

    case 'wait':
      await page.waitForSelector(target, { state: 'visible', timeout: 20000 });
      return;
  }

  switch (action) {
    case 'signIn':
      await page.goto(`${BASE}/index.html`);
      await typeSlowly(page, '#email', world.member.email);
      await typeSlowly(page, '#password', world.member.password);
      await pressWithPointer(page, '#login-btn');
      await page.waitForURL('**/app.html', { timeout: 30000 });
      await page.waitForSelector('#user-name', { timeout: 20000 });
      return;

    case 'language':
      // The class is lang-btn-active, not .active - read off js/i18n.js.
      await pressWithPointer(page, '.lang-toggle .lang-btn:not(.lang-btn-active)');
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

  // Every selector here is read by BOTH Playwright and document.querySelector,
  // so Playwright-only syntax is a bug waiting for the scene that uses it.
  for (const scene of scenes) {
    if (scene.highlight && scene.highlight.includes('>>')) {
      throw new Error(`scene "${scene.id}" highlights with Playwright-only syntax: ${scene.highlight}`);
    }
  }

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
  // Somebody else's offer, so Browse has a row that is genuinely not the
  // member's. 750 metric tons of zinc, not 25,000 of copper cathode: the
  // first film quoted a quarter of a billion dollars of metal in a sample,
  // which reads as a fantasy to anybody in the trade.
  await query(
    `insert into public.listings
       (user_id, type, commodity, quantity, unit, incoterm, origin, specification,
        status, reference_number)
     values ($1, 'sell', 'Zinc Ingots', 750, 'Metric tons', 'FOB', 'Peru',
             'SHG 99.995% Zn, 25kg ingots', 'available', $2)`,
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

  // Prove the overlay is actually there before filming fourteen scenes that
  // depend on it. The first run failed on scene one with "Cannot read
  // properties of undefined", which says nothing about the cause - the init
  // script had thrown because the document did not exist yet. A check here
  // turns that into one sentence naming the problem.
  await page.goto(`${BASE}/index.html`);
  const overlayReady = await page.evaluate(() =>
    Boolean(window.__jericho && typeof window.__jericho.caption === 'function'));
  if (!overlayReady) {
    throw new Error('the overlay never loaded, so there would be no pointer, ring or captions');
  }

  if (lang === 'es') {
    await page.evaluate(() => { try { localStorage.setItem('jericho.language', 'es'); } catch (e) {} });
  }

  // Scenes that overran their line, collected rather than thrown one at a
  // time: one run should name every line that needs lengthening.
  const overruns = [];

  for (const scene of scenes) {
    const seconds = timings[`${film}-${lang}-${scene.id}`];
    if (!seconds) throw new Error(`no narration timing for ${film}-${lang}-${scene.id}`);

    const budget = Math.round(seconds * 1000) + PAUSE;
    const began = Date.now();

    await page.evaluate(t => window.__jericho.caption(t), scene.say[lang]);

    // ZOOM IN, if this scene has a subject. The viewer gets to see which
    // control is about to be pressed before anything happens to it.
    if (scene.zoom) {
      await page.evaluate(
        ([sel, scale]) => window.__jericho.zoomTo(sel, scale),
        [scene.zoom, scene.zoomScale || null]).catch(() => {});
      await wait(ZOOM_SETTLE);
    } else {
      await page.evaluate(() => window.__jericho.zoomOut()).catch(() => {});
      await wait(ZOOM_SETTLE);
    }

    if (scene.highlight) {
      await page.evaluate(s => window.__jericho.ringAround(s), scene.highlight).catch(() => {});
    } else {
      await page.evaluate(() => window.__jericho.ringAround(null)).catch(() => {});
    }

    await perform(page, scene.do, world);

    // ZOOM OUT AFTER THE PRESS, so the shot shows what the press DID. This
    // is the whole point of zooming: close for the control, wide for the
    // consequence.
    if (scene.zoom && scene.zoomOutAfter) {
      await wait(500);
      await page.evaluate(() => window.__jericho.zoomOut()).catch(() => {});
      await wait(ZOOM_SETTLE);
      if (scene.highlightAfter) {
        await page.evaluate(s => window.__jericho.ringAround(s), scene.highlightAfter).catch(() => {});
      }
    }

    // HOLD for whatever is LEFT of the line, not for the whole line.
    //
    // This is a fix, not a refinement. The previous version performed the
    // actions and THEN held for the full narration, so every scene's picture
    // ran long by however many seconds its typing and clicking took - and the
    // error accumulated, scene after scene, until the voice was describing
    // something several scenes ahead of the picture. assemble.js then cut the
    // tail off with -shortest, which hid the drift behind a film of the right
    // total length. It is the likeliest reason the first film did not seem to
    // match what was being said.
    const used = Date.now() - began;
    const hold = budget - used;
    if (hold < 0) {
      overruns.push({ id: scene.id, seconds, over: (-hold / 1000) });
      console.log(`  ${scene.id.padEnd(16)} OVERRAN by ${(-hold / 1000).toFixed(1)}s ` +
                  `(line ${seconds.toFixed(1)}s, actions took ${(used / 1000).toFixed(1)}s)`);
    } else {
      console.log(`  ${scene.id.padEnd(16)} ${(used / 1000).toFixed(1)}s acting, ` +
                  `${(hold / 1000).toFixed(1)}s holding`);
    }
    await wait(Math.max(hold, 0));
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

  // A film whose picture runs longer than its voice is a film where the two
  // disagree, and assemble.js would hide it by cutting the end off. Small
  // overruns wash out; a few seconds in total do not.
  if (overruns.length) {
    const total = overruns.reduce((sum, o) => sum + o.over, 0);
    console.log(`\n${overruns.length} scene(s) overran their line by ${total.toFixed(1)}s in total:`);
    for (const o of overruns) {
      console.log(`  ${o.id}: needs about ${(o.seconds + o.over).toFixed(1)}s of speech, has ${o.seconds.toFixed(1)}s`);
    }
    if (total > 3) {
      throw new Error(
        `the picture runs ${total.toFixed(1)}s longer than the voice. Lengthen the lines ` +
        `named above in video/script.json - do not shorten the actions, which are what ` +
        `the film is of.`);
    }
    console.log('Under three seconds in total, which the pauses absorb.');
  }
}

main().catch(async (err) => {
  console.error('\nThe recording failed:', err.message);
  try { await cleanup(); } catch { /* teardown is best effort on a failure */ }
  process.exit(1);
});
