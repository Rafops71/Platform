#!/usr/bin/env node
'use strict';
// A short look at the LIVE site after a push to main has been published (docs/AGREED-2026-11-25-ci-step5.md).
//
// READS ONLY. It makes a handful of GET requests to the public site and creates no account, no listing, no
// message and no row anywhere. It is not part of the gate: it runs AFTER the publish jobs, so a red result
// cannot stop a publish; it says, on the run, that the site just published is not what a visitor receives.
//
//   node scripts/live-smoke.js                 check the live site against EXPECTED_REVISION (or just "a commit")
//   node scripts/live-smoke.js --self-test     break a fake site several ways and require a failure each time
//
// What it checks: the app address answers; /REVISION is a commit and, when EXPECTED_REVISION is set, is THAT
// commit (Cloudflare can take a little while to serve a new publish, so it waits up to WAIT_SECONDS for it);
// the app page, the sign-in page and the register page answer with a page; the front page answers and shows
// the owner's headline. SITE_URL, FRONT_URL and FRONT_PHRASE override the addresses, as in morning-report.js.

const SITE = (process.env.SITE_URL || 'https://app.myplatform.trade/').replace(/\/?$/, '/');
const FRONT_URL = process.env.FRONT_URL || 'https://www.myplatform.trade/';
const FRONT_PHRASE = process.env.FRONT_PHRASE || 'Where opportunity meets discretion.';
const PAGES = ['index.html', 'app.html', 'register.html'];

async function get(doFetch, url) {
  const res = await doFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** One pass. Returns the list of problems (empty = fine). */
async function once({ doFetch, expected, site = SITE, front = FRONT_URL, phrase = FRONT_PHRASE }) {
  const problems = [];
  try {
    const r = await get(doFetch, site + 'REVISION');
    const rev = r.text.trim();
    if (!r.ok) problems.push(`${site}REVISION answered HTTP ${r.status}`);
    else if (!/^[0-9a-f]{40}$/.test(rev)) problems.push(`${site}REVISION is not a commit`);
    else if (expected && rev !== expected) problems.push(`${site}REVISION is ${rev.slice(0, 7)}, expected ${expected.slice(0, 7)}`);
  } catch (e) { problems.push(`${site}REVISION could not be read (${e.message})`); }
  for (const p of PAGES) {
    try {
      const r = await get(doFetch, site + p);
      if (!r.ok) problems.push(`${site}${p} answered HTTP ${r.status}`);
      else if (!/<html/i.test(r.text)) problems.push(`${site}${p} did not answer with a page`);
    } catch (e) { problems.push(`${site}${p} could not be read (${e.message})`); }
  }
  try {
    const r = await get(doFetch, front);
    if (!r.ok) problems.push(`${front} answered HTTP ${r.status}`);
    else if (!r.text.includes(phrase)) problems.push(`${front} does not show "${phrase}"`);
  } catch (e) { problems.push(`${front} could not be read (${e.message})`); }
  return problems;
}

/** Tries until clean or until the time is up; the last pass's problems are what is reported. */
async function smoke({ doFetch = fetch, expected = '', waitSeconds = 0, pauseMs = 10_000, ...rest }) {
  const until = Date.now() + waitSeconds * 1000;
  for (;;) {
    const problems = await once({ doFetch, expected, ...rest });
    if (!problems.length || Date.now() >= until) return problems;
    await new Promise((r) => setTimeout(r, pauseMs));
  }
}

async function selfTest() {
  const REV = 'a'.repeat(40);
  const good = {
    'https://app.example/REVISION': REV + '\n',
    'https://app.example/index.html': '<html>x</html>',
    'https://app.example/app.html': '<html>x</html>',
    'https://app.example/register.html': '<html>x</html>',
    'https://front.example/': '<html>Where opportunity meets discretion.</html>',
  };
  const fake = (pages) => async (url) => {
    if (!(url in pages)) return { ok: false, status: 404, text: async () => 'nope' };
    const v = pages[url];
    if (v instanceof Error) throw v;
    return { ok: true, status: 200, text: async () => v };
  };
  const run = (pages, expected = REV) => smoke({ doFetch: fake(pages), expected, site: 'https://app.example/', front: 'https://front.example/', phrase: 'Where opportunity meets discretion.' });
  const mutations = {
    'the site is down': { ...good, 'https://app.example/REVISION': new Error('ECONNRESET') },
    'REVISION is an error page': { ...good, 'https://app.example/REVISION': '<html>522</html>' },
    'REVISION is an older commit': { ...good, 'https://app.example/REVISION': 'b'.repeat(40) },
    'the app page is missing': (() => { const g = { ...good }; delete g['https://app.example/app.html']; return g; })(),
    'the register page is not a page': { ...good, 'https://app.example/register.html': 'plain text' },
    'the front page lost its headline': { ...good, 'https://front.example/': '<html>hello</html>' },
    'the front page is missing': (() => { const g = { ...good }; delete g['https://front.example/']; return g; })(),
  };
  if ((await run(good)).length) { console.error('self-test FAILED: a good site was refused'); process.exit(1); }
  for (const [what, pages] of Object.entries(mutations)) {
    if (!(await run(pages)).length) { console.error(`self-test FAILED: "${what}" was not caught`); process.exit(1); }
  }
  console.log(`Live smoke check: a good site passes and all ${Object.keys(mutations).length} deliberate breaks are caught.`);
}

if (process.argv.includes('--self-test')) selfTest();
else if (require.main === module) {
  const expected = (process.env.EXPECTED_REVISION || '').trim();
  smoke({ expected, waitSeconds: Number(process.env.WAIT_SECONDS) || 0 }).then((problems) => {
    if (problems.length) {
      console.error('Live smoke check FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
      process.exit(1);
    }
    console.log(`Live smoke check OK: ${SITE} serves ${expected ? expected.slice(0, 7) : 'a commit'}, its pages answer, and the front page shows its headline.`);
  });
}
