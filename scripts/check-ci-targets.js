#!/usr/bin/env node
'use strict';
// Which database does each CI run touch? Pull requests: STAGING. Pushes to main: LIVE. Nothing else.
//
// WHY (docs/AGREED-2026-11-16-tooling.md, item 4). The browser suites in ci.yml (the Function checklist
// and Safari) used to run on the live project for every pull request. They now run on staging for a
// pull request and stay on live for a push to main, which is what gates publishing. A rule that moves
// a gate from one database to another must not be able to weaken the gate by accident, so this
// reads .github/workflows/ci.yml and fails the build if:
//   1. the concurrency group is not exactly "ci-staging-database for a pull request, otherwise
//      ci-live-database" (a push must stay in the group apply-sql.yml shares with live);
//   2. either browser job's TARGET_* block differs from the canonical one below, i.e. if anything
//      other than a pull request could resolve to a staging value, or a pull request to a live one;
//   3. any secrets.SUPABASE_* / secrets.STAGING_* appears anywhere else in the file, except the two
//      named steps that have a reason (the read-only "applied live?" probe and the staging bring-up,
//      which only runs on pull requests);
//   4. a SERVE_* line (the test server's override of the project) is not empty on a push;
//   5. the NIGHTLY RUN (docs/AGREED-2026-11-25-ci-step5.md): the security grid, the pictures and "Volume and
//      concurrency" (stress) run in security-grid.yml on its schedule and by hand, and NOT in ci.yml, so they
//      are not on any pull request and not on any push. ci.yml must have none of those jobs and no crowd
//      scan; security-grid.yml must have a schedule, a manual trigger and all three jobs, and the crowd scan.
//      Staging still takes turns inside a pull request: Safari waits for the checklist.
// It also evaluates the rule for both events and prints what each one resolves to.
//   node scripts/check-ci-targets.js            check the real file
//   node scripts/check-ci-targets.js --self-test   break a copy several ways and require a failure each time

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
const GRID_FILE = path.join(__dirname, '..', '.github', 'workflows', 'security-grid.yml');
const PR = "github.event_name == 'pull_request'";
const STAGING_URL = "'https://pqxlfgvjoowawzgoszna.supabase.co'";

const CANONICAL = {
  TARGET_URL: `${PR} && ${STAGING_URL} || secrets.SUPABASE_URL`,
  TARGET_ANON_KEY: `${PR} && '<STAGING-ANON-KEY>' || secrets.SUPABASE_ANON_KEY`,
  TARGET_SERVICE_ROLE_KEY: `${PR} && secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY`,
  TARGET_DB_URL: `${PR} && secrets.STAGING_SUPABASE_DB_URL || secrets.SUPABASE_DB_URL`,
};
const GROUP = `${PR} && 'ci-staging-database' || 'ci-live-database'`;
const ALLOWED_STEPS = {
  'Is every new migration applied live?': { secret: 'secrets.SUPABASE_DB_URL', needsPrOnly: false },
  "Bring staging up to this commit's SQL": { secret: 'secrets.STAGING_SUPABASE_DB_URL', needsPrOnly: true },
};

function exprOf(line) { const m = /\$\{\{\s*(.*?)\s*\}\}/.exec(line); return m ? m[1] : null; }
// A long public key is shown as a placeholder so the canonical text stays readable.
const norm = (e) => e && e.replace(/'eyJ[\w.-]+'/g, "'<STAGING-ANON-KEY>'");

/** The text of one job (from "  <id>:" to the next job at the same indent). */
function jobBlock(text, id) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `  ${id}:`);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^  [A-Za-z][\w-]*:\s*$/.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join('\n');
}
const runsOf = (block) => (block || '').split('\n').filter((l) => /^\s+run: /.test(l)).map((l) => l.trim());
// The one command that runs in the nightly grid and never in a pull request's grid.
const NIGHTLY_ONLY_RUN = 'run: node scripts/crowd-scan.js';
const MOVED_JOBS = ['grid', 'layout', 'pictures', 'stress'];

function check(text, gridText) {
  const problems = [];
  const lines = text.split('\n');

  // 1. the group
  const g = lines.find((l) => /^\s{2}group:/.test(l) && l.includes('ci-'));
  if (!g || exprOf(g) !== GROUP) problems.push(`concurrency group must be: ${GROUP}`);

  // 2. the TARGET blocks, in exactly two jobs
  for (const [name, canon] of Object.entries(CANONICAL)) {
    const hits = lines.filter((l) => new RegExp(`^\\s+${name}:`).test(l));
    if (hits.length !== 2) problems.push(`${name} must be declared exactly twice (checklist and safari), found ${hits.length}`);
    for (const h of hits) if (norm(exprOf(h)) !== canon) problems.push(`${name} differs from the rule: ${norm(exprOf(h))}`);
  }

  // 3. every other mention of a database secret, by step
  let step = '';
  let stepIf = '';
  let job = '';
  lines.forEach((l, i) => {
    const jm = /^  ([A-Za-z][\w-]*):\s*$/.exec(l);
    if (jm) job = jm[1];
    if (/^\S/.test(l) && !/^jobs:/.test(l)) job = '';
    const sm = /^\s+- name:\s*(.*)$/.exec(l);
    if (sm) { step = sm[1].trim(); stepIf = ''; }
    const im = /^\s+if:\s*(.*)$/.exec(l);
    if (im && step) stepIf = im[1].trim();
    if (!/secrets\.(SUPABASE_|STAGING_)/.test(l) && !/pqxlfgvjoowawzgoszna/.test(l)) return;
    if (/^\s+TARGET_/.test(l)) return;                    // checked in 2
    if (/^\s*#/.test(l)) return;                          // a comment
    const allowed = ALLOWED_STEPS[step];
    // the step's `if:` may sit after its env block, so look ahead a few lines for it
    const ahead = lines.slice(i, i + 12).join('\n');
    const prOnly = /if:\s*github\.event_name == 'pull_request'/.test(ahead) || stepIf === "github.event_name == 'pull_request'";
    if (allowed && l.includes(allowed.secret) && (!allowed.needsPrOnly || prOnly)) return;
    problems.push(`line ${i + 1}: a database secret or the staging address outside the rule, in step "${step}": ${l.trim()}`);
  });

  // 4. SERVE_* empty on a push
  for (const l of lines.filter((x) => /^\s+SERVE_SUPABASE_(URL|KEY):/.test(x))) {
    const e = exprOf(l) || '';
    if (!new RegExp(`^${PR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} && env\\.TARGET_(URL|ANON_KEY) \\|\\| ''$`).test(e)) problems.push(`SERVE_* must be empty unless a pull request: ${l.trim()}`);
  }

  // 5. the nightly run holds the grid, the pictures and stress; ci.yml holds none of them
  const needsOf = (blk) => ((/^    needs: (.*)$/m.exec(blk || '') || [])[1] || '');
  const ifOf = (blk) => ((/^    if: (.*)$/m.exec(blk || '') || [])[1] || '');
  for (const j of MOVED_JOBS) {
    if (jobBlock(text, j)) problems.push(`ci.yml has a "${j}" job: it runs in the nightly run (security-grid.yml) only, never on a pull request or a push (docs/AGREED-2026-11-25-ci-step5.md)`);
  }
  if (/scripts\/crowd-scan\.js/.test(text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'))) problems.push('the crowd scan is in ci.yml: it is nightly only (owner, 17 Nov 2026)');
  if (gridText != null) {
    const body = gridText.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    if (!/^on:\n\s+schedule:\n\s+- cron: /m.test(body)) problems.push('security-grid.yml has no schedule: the nightly run would never happen');
    if (!/^\s+workflow_dispatch:/m.test(body)) problems.push('security-grid.yml cannot be run by hand (no workflow_dispatch)');
    if (/^\s+(pull_request|push):/m.test(body)) problems.push('security-grid.yml runs on a pull request or a push: it must be nightly and by hand only');
    for (const j of ['grid', 'pictures', 'stress']) if (!jobBlock(gridText, j)) problems.push(`security-grid.yml has no "${j}" job: it must run in the nightly run`);
    const nightlyRuns = runsOf(jobBlock(gridText, 'grid')).join('\n') + '\n' + runsOf(jobBlock(gridText, 'stress')).join('\n');
    if (!nightlyRuns.includes(NIGHTLY_ONLY_RUN)) problems.push('the crowd scan is missing from the nightly grid in security-grid.yml: it must run there (owner, 17 Nov 2026)');
    const st = jobBlock(gridText, 'stress') || '';
    for (const cmd of ['npm run stress', 'npm run check:recommend-cap', 'npm run test:sender']) if (!st.includes(cmd)) problems.push(`the nightly stress job does not run \`${cmd}\``);
    if (/secrets\.SUPABASE_/.test(body.replace(/secrets\.STAGING_[A-Z_]+/g, ''))) problems.push('security-grid.yml names a LIVE secret: the nightly run touches staging only');
  }
  // 6. only a pull request that changes documents alone may skip the browser chain (docs/ROADMAP-2026-11-22.md 0.6, step 2).
  //    A push to main and a manual run always run everything: that run gates publishing.
  const changes = jobBlock(text, 'changes');
  const checklistJob = jobBlock(text, 'checklist');
  const safariJob = jobBlock(text, 'safari');
  if (!changes) problems.push('ci.yml has no "changes" job: the rule for skipping the browser chain on a documents-only pull request lives there');
  else {
    // The branch for anything that is not a pull request must say browser=true and then END (exit 0) before any other line
    // can run, so no later line, however it got there, can turn a push's answer into false.
    if (!/if \[ "\$EVENT" != "pull_request" \]; then\n\s+echo "browser=true" >> "\$GITHUB_OUTPUT"\n\s+echo "[^\n]*"\n\s+exit 0\n\s+fi/.test(changes)) problems.push('the "changes" job must answer browser=true for anything that is not a pull request and then exit 0 at once (a push to main must never skip the checklist)');
    const falseAt = changes.indexOf('browser=false');
    const exitAt = changes.indexOf('exit 0');
    if (falseAt >= 0 && exitAt >= 0 && falseAt < exitAt) problems.push('"browser=false" is written before the push branch has ended');
    if (/browser=\$\{?[a-z]/i.test(changes.slice(0, exitAt < 0 ? 0 : exitAt))) problems.push('the push branch must not compute its answer');
  }
  if (checklistJob) {
    if (ifOf(checklistJob) !== "${{ needs.changes.outputs.browser == 'true' }}") problems.push(`the checklist job's "if" must be exactly: \${{ needs.changes.outputs.browser == 'true' }} (it is: ${ifOf(checklistJob) || 'missing'})`);
    if (!/\bchanges\b/.test(needsOf(checklistJob))) problems.push('the checklist job must wait for "changes"');
  }
  // staging still takes turns inside a pull request: Safari waits for the checklist
  if (safariJob && !/\bchecklist\b/.test(needsOf(safariJob))) problems.push('the safari job must wait for "checklist": staging jobs take turns');
  return problems;
}

/** What the rule resolves to for an event: 'staging', 'live', or 'mixed'. */
function resolve(event) {
  const kinds = Object.values(CANONICAL).map((c) => {
    const m = /^(.*?) && (.*?) \|\| (.*)$/.exec(c);
    const picked = event === 'pull_request' ? m[2] : m[3];
    return /STAGING|pqxlfg/.test(picked) ? 'staging' : 'live';
  });
  return new Set(kinds).size === 1 ? kinds[0] : 'mixed';
}

if (process.argv.includes('--self-test')) {
  const real = fs.readFileSync(FILE, 'utf8');
  const gridReal = fs.readFileSync(GRID_FILE, 'utf8');
  if (check(real, gridReal).length) { console.error('self-test FAILED: the real file does not pass:\n' + check(real, gridReal).join('\n')); process.exit(1); }
  const mutations = {
    'a push resolves to staging': (t) => t.replace(`|| secrets.SUPABASE_DB_URL }}`, `|| secrets.STAGING_SUPABASE_DB_URL }}`),
    'a pull request resolves to live': (t) => t.replace(`secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY`, `secrets.SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY`),
    'the group stops separating live from staging': (t) => t.replace(`'ci-staging-database' || 'ci-live-database'`, `'ci-live-database' || 'ci-live-database'`),
    'a browser step names a live secret directly': (t) => t.replace(`SUPABASE_DB_URL: \${{ env.TARGET_DB_URL }}\n          SERVE_SUPABASE_URL`, `SUPABASE_DB_URL: \${{ secrets.SUPABASE_DB_URL }}\n          SERVE_SUPABASE_URL`),
    'a publishing job is handed the staging key': (t) => t.replace(`  deploy-www:\n    name: Publish the front page to Cloudflare Pages\n`, `  deploy-www:\n    name: Publish the front page to Cloudflare Pages\n    env:\n      K: \${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}\n`),
    'the push branch no longer ends at once': (t) => t.replace('echo "Not a pull request: every suite always runs (this is the run that gates publishing)."\n            exit 0', 'echo "Not a pull request: every suite always runs (this is the run that gates publishing)."'),
    'a push could skip the checklist': (t) => t.replace('echo "browser=true" >> "$GITHUB_OUTPUT"\n            echo "Not a pull request', 'echo "browser=false" >> "$GITHUB_OUTPUT"\n            echo "Not a pull request'),
    'the checklist can be skipped for another reason': (t) => t.replace("    if: ${{ needs.changes.outputs.browser == 'true' }}\n    runs-on", "    if: ${{ needs.changes.outputs.browser == 'true' && github.actor != 'x' }}\n    runs-on"),
    'Safari stops waiting for the checklist': (t) => t.replace(/(  safari:[\s\S]*?)    needs: checklist\n/, '$1    needs: changes\n'),
    'the grid comes back as a job of ci.yml': (t) => t.replace('\n  package:\n', '\n  grid:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n\n  package:\n'),
    'the pictures come back as a job of ci.yml': (t) => t.replace('\n  package:\n', '\n  pictures:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n\n  package:\n'),
    'stress comes back as a job of ci.yml': (t) => t.replace('\n  package:\n', '\n  stress:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run stress\n\n  package:\n'),
    'the crowd scan appears in ci.yml': (t) => t.replace('\n  package:\n', '\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/crowd-scan.js\n\n  package:\n'),
    'the test server override stays set on a push': (t) => t.replace(`SERVE_SUPABASE_URL: \${{ github.event_name == 'pull_request' && env.TARGET_URL || '' }}`, `SERVE_SUPABASE_URL: \${{ env.TARGET_URL }}`),
  };
  for (const [what, mutate] of Object.entries(mutations)) {
    const mutated = mutate(real);
    if (mutated === real) { console.error(`self-test FAILED: the mutation "${what}" did not change the file`); process.exit(1); }
    if (!check(mutated, gridReal).length) { console.error(`self-test FAILED: "${what}" was not caught`); process.exit(1); }
  }
  // the nightly file is broken instead
  const nightlyBreaks = {
    'the crowd scan is dropped from the nightly': (g) => g.replace(/      - name: Forty members at once\n        run: node scripts\/crowd-scan\.js\n/, ''),
    'the nightly loses its schedule': (g) => g.replace(/  schedule:\n    - cron: [^\n]*\n/, ''),
    'the nightly cannot be run by hand': (g) => g.replace('  workflow_dispatch: {}\n', ''),
    'the nightly runs on every pull request': (g) => g.replace('on:\n  schedule:', 'on:\n  pull_request:\n  schedule:'),
    'the nightly loses the stress job': (g) => g.replace('  stress:\n    name: Volume and concurrency', '  stress_gone:\n    name: Volume and concurrency'),
    'the nightly stress job loses the cap check': (g) => g.replace('npm run check:recommend-cap', 'echo skipped'),
    'the nightly loses the pictures': (g) => g.replace('\n  pictures:\n', '\n  pictures_gone:\n'),
    'the nightly is handed a live secret': (g) => g.replace('secrets.STAGING_SUPABASE_DB_URL', 'secrets.SUPABASE_DB_URL'),
  };
  for (const [what, mutate] of Object.entries(nightlyBreaks)) {
    const mutated = mutate(gridReal);
    if (mutated === gridReal) { console.error(`self-test FAILED: the mutation "${what}" did not change security-grid.yml`); process.exit(1); }
    if (!check(real, mutated).length) { console.error(`self-test FAILED: "${what}" was not caught`); process.exit(1); }
  }
  console.log(`CI target rule: the real file passes and all ${Object.keys(mutations).length + Object.keys(nightlyBreaks).length} deliberate breaks are caught.`);
  process.exit(0);
}

const problems = check(fs.readFileSync(FILE, 'utf8'), fs.readFileSync(GRID_FILE, 'utf8'));
if (problems.length) {
  console.error('\nCI target check FAILED\n');
  problems.forEach((p) => console.error('  • ' + p));
  process.exit(1);
}
console.log(`CI target rule OK: a pull request's browser suites use ${resolve('pull_request').toUpperCase()}, a push to main uses ${resolve('push').toUpperCase()}.`);
