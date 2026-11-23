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
//   5. staging TAKES TURNS: the security grid (a job of ci.yml, pull requests only, staging secrets only)
//      must wait for BOTH the checklist and Safari, and the pictures must wait for the grid, because the
//      grid's privilege scan counts whole tables and any other writer on staging in between breaks it
//      (PR 117: "invitations changed from 5 to 6"); and the grid's steps must be the same commands as the
//      ones in security-grid.yml (the nightly copy), so the two cannot drift apart. ONE difference is
//      required (owner, 17 Nov 2026, docs/AGREED-2026-11-17-crowd-scan.md): the crowd scan (a speed test
//      of the small staging server) must be in the nightly copy and must NOT be in the pull-request grid.
// It also evaluates the rule for both events and prints what each one resolves to.
//   node scripts/check-ci-targets.js            check the real file
//   node scripts/check-ci-targets.js --self-test   break a copy five ways and require a failure each time

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
const STAGING_ONLY_JOBS = new Set(['grid', 'pictures']);

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
    // The grid and the pictures are staging-only jobs: STAGING_ secrets and the staging address are theirs;
    // a LIVE secret is never allowed there (and the job must be pull-request-only: checked in 5).
    if (STAGING_ONLY_JOBS.has(job) && !/secrets\.SUPABASE_/.test(l)) return;
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

  // 5. staging takes turns, and only on pull requests
  const grid = jobBlock(text, 'grid');
  const pics = jobBlock(text, 'pictures');
  const needsOf = (b) => ((/^    needs: (.*)$/m.exec(b || '') || [])[1] || '');
  const ifOf = (b) => ((/^    if: (.*)$/m.exec(b || '') || [])[1] || '');
  if (!grid) problems.push('ci.yml has no "grid" job: the security grid must run in this workflow, after the browser suites');
  else {
    for (const need of ['checklist', 'safari']) if (!new RegExp(`\\b${need}\\b`).test(needsOf(grid))) problems.push(`the grid job must wait for "${need}" (needs: ${needsOf(grid) || 'nothing'}): staging jobs take turns`);
    if (!ifOf(grid).includes(PR)) problems.push('the grid job must run on pull requests only (its "if" must contain ' + PR + ')');
    if (/needs\.[\w-]+\.result/.test(ifOf(grid)) === false && /^\s*if:.*always\(\)/m.test(grid)) problems.push('use !cancelled(), not always(), on the grid job');
  }
  if (!pics) problems.push('ci.yml has no "pictures" job');
  else {
    if (!/\bgrid\b/.test(needsOf(pics))) problems.push(`the pictures job must wait for "grid" (needs: ${needsOf(pics) || 'nothing'})`);
    if (!ifOf(pics).includes(PR)) problems.push('the pictures job must run on pull requests only');
    // The visual tests read the staging address and key from the environment; without them they fail
    // ("SUPABASE_URL ... are required", PR 120 run 1).
    for (const v of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) if (!new RegExp(`^\\s+${v}: .+`, 'm').test(pics)) problems.push(`the pictures job must set ${v} to the staging project's value`);
  }
  // 6. only a pull request that changes documents alone may skip the browser chain (docs/ROADMAP-2026-11-22.md 0.6, step 2).
  //    A push to main and a manual run always run everything: that run gates publishing.
  const changes = jobBlock(text, 'changes');
  const checklistJob = jobBlock(text, 'checklist');
  if (!changes) problems.push('ci.yml has no "changes" job: the rule for skipping the browser chain on a documents-only pull request lives there');
  else if (!/if \[ "\$EVENT" != "pull_request" \]; then\n\s+echo "browser=true" >> "\$GITHUB_OUTPUT"/.test(changes)) problems.push('the "changes" job must answer browser=true for anything that is not a pull request (a push to main must never skip the checklist)');
  if (checklistJob) {
    if (ifOf(checklistJob) !== "${{ needs.changes.outputs.browser == 'true' }}") problems.push(`the checklist job's "if" must be exactly: \${{ needs.changes.outputs.browser == 'true' }} (it is: ${ifOf(checklistJob) || 'missing'})`);
    if (!/\bchanges\b/.test(needsOf(checklistJob))) problems.push('the checklist job must wait for "changes"');
  }
  if (grid && (!/\bchanges\b/.test(needsOf(grid)) || !ifOf(grid).includes("needs.changes.outputs.browser == 'true'"))) problems.push('the grid job must wait for "changes" and run only when it says browser == true');
  // the nightly copy and this one must run the same commands, in the same order
  if (gridText != null && grid) {
    const ciRuns = runsOf(grid);
    const nightlyRuns = runsOf(jobBlock(gridText, 'grid'));
    if (ciRuns.includes(NIGHTLY_ONLY_RUN)) problems.push('the crowd scan (' + NIGHTLY_ONLY_RUN + ') is back in the pull-request grid in ci.yml: it is nightly only (owner, 17 Nov 2026)');
    if (!nightlyRuns.includes(NIGHTLY_ONLY_RUN)) problems.push('the crowd scan is missing from the nightly grid in security-grid.yml: it must run there (owner, 17 Nov 2026)');
    const a = JSON.stringify(ciRuns);
    const b = JSON.stringify(nightlyRuns.filter((r) => r !== NIGHTLY_ONLY_RUN));
    if (a !== b) problems.push('the grid steps in ci.yml and in security-grid.yml have drifted apart (their run: commands differ, apart from the nightly-only crowd scan)');
    const pa = JSON.stringify(runsOf(pics));
    const pb = JSON.stringify(runsOf(jobBlock(gridText, 'pictures')));
    if (pics && pa !== pb) problems.push('the pictures steps in ci.yml and in security-grid.yml have drifted apart');
  }
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
    'the grid stops waiting for Safari': (t) => t.replace('    needs: [changes, checklist, safari]\n    if: ${{ !cancelled()', '    needs: [changes, checklist]\n    if: ${{ !cancelled()'),
    'the grid stops waiting for the checklist': (t) => t.replace('    needs: [changes, checklist, safari]\n    if: ${{ !cancelled()', '    needs: [changes, safari]\n    if: ${{ !cancelled()'),
    'the grid would run on a push too': (t) => t.replace(`    needs: [changes, checklist, safari]\n    if: \${{ !cancelled() && github.event_name == 'pull_request' && needs.changes.outputs.browser == 'true' }}`, `    needs: [changes, checklist, safari]\n    if: \${{ !cancelled() && needs.changes.outputs.browser == 'true' }}`),
    'the grid ignores the documents-only rule': (t) => t.replace(`github.event_name == 'pull_request' && needs.changes.outputs.browser == 'true' }}\n    runs-on: ubuntu-latest\n    env:\n      SUPABASE_URL`, `github.event_name == 'pull_request' }}\n    runs-on: ubuntu-latest\n    env:\n      SUPABASE_URL`),
    'a push could skip the checklist': (t) => t.replace('echo "browser=true" >> "$GITHUB_OUTPUT"\n            echo "Not a pull request', 'echo "browser=false" >> "$GITHUB_OUTPUT"\n            echo "Not a pull request'),
    'the checklist can be skipped for another reason': (t) => t.replace("    if: ${{ needs.changes.outputs.browser == 'true' }}\n    runs-on", "    if: ${{ needs.changes.outputs.browser == 'true' && github.actor != 'x' }}\n    runs-on"),
    'the pictures stop waiting for the grid': (t) => t.replace('    needs: [grid, layout]', '    needs: [layout]'),
    'the grid is handed a live secret': (t) => t.replace('          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}\n\n      # Same staging world', '          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}\n\n      # Same staging world'),
    'the pictures job loses its staging address': (t) => t.replace(/(  pictures:[\s\S]*?)      SUPABASE_URL: https:\/\/pqxlfgvjoowawzgoszna\.supabase\.co\n/, '$1'),
    'a grid step is changed in ci.yml only': (t) => t.replace('run: node scripts/identity-scan.js', 'run: node scripts/identity-scan.js --quick'),
    'the crowd scan reappears in the pull-request grid': (t) => t.replace('      # NOT HERE: "Forty members at once"', '      - name: Forty members at once\n        run: node scripts/crowd-scan.js\n      # NOT HERE: "Forty members at once"'),
    'the test server override stays set on a push': (t) => t.replace(`SERVE_SUPABASE_URL: \${{ github.event_name == 'pull_request' && env.TARGET_URL || '' }}`, `SERVE_SUPABASE_URL: \${{ env.TARGET_URL }}`),
  };
  for (const [what, mutate] of Object.entries(mutations)) {
    const mutated = mutate(real);
    if (mutated === real) { console.error(`self-test FAILED: the mutation "${what}" did not change the file`); process.exit(1); }
    if (!check(mutated, gridReal).length) { console.error(`self-test FAILED: "${what}" was not caught`); process.exit(1); }
  }
  // the nightly copy is broken instead: the crowd scan is dropped from security-grid.yml
  const noScan = gridReal.replace(/      - name: Forty members at once\n        run: node scripts\/crowd-scan\.js\n/, '');
  if (noScan === gridReal) { console.error('self-test FAILED: the nightly mutation did not change security-grid.yml'); process.exit(1); }
  if (!check(real, noScan).length) { console.error('self-test FAILED: "the crowd scan is missing from the nightly" was not caught'); process.exit(1); }
  console.log(`CI target rule: the real file passes and all ${Object.keys(mutations).length + 1} deliberate breaks are caught.`);
  process.exit(0);
}

const problems = check(fs.readFileSync(FILE, 'utf8'), fs.readFileSync(GRID_FILE, 'utf8'));
if (problems.length) {
  console.error('\nCI target check FAILED\n');
  problems.forEach((p) => console.error('  • ' + p));
  process.exit(1);
}
console.log(`CI target rule OK: a pull request's browser suites use ${resolve('pull_request').toUpperCase()}, a push to main uses ${resolve('push').toUpperCase()}.`);
