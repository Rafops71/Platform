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
//   4. a SERVE_* line (the test server's override of the project) is not empty on a push.
// It also evaluates the rule for both events and prints what each one resolves to.
//   node scripts/check-ci-targets.js            check the real file
//   node scripts/check-ci-targets.js --self-test   break a copy five ways and require a failure each time

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
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

function check(text) {
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
  lines.forEach((l, i) => {
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
  if (check(real).length) { console.error('self-test FAILED: the real file does not pass:\n' + check(real).join('\n')); process.exit(1); }
  const mutations = {
    'a push resolves to staging': (t) => t.replace(`|| secrets.SUPABASE_DB_URL }}`, `|| secrets.STAGING_SUPABASE_DB_URL }}`),
    'a pull request resolves to live': (t) => t.replace(`secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY`, `secrets.SUPABASE_SERVICE_ROLE_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY`),
    'the group stops separating live from staging': (t) => t.replace(`'ci-staging-database' || 'ci-live-database'`, `'ci-live-database' || 'ci-live-database'`),
    'a browser step names a live secret directly': (t) => t.replace(`SUPABASE_DB_URL: \${{ env.TARGET_DB_URL }}\n          SERVE_SUPABASE_URL`, `SUPABASE_DB_URL: \${{ secrets.SUPABASE_DB_URL }}\n          SERVE_SUPABASE_URL`),
    'a publishing job is handed the staging key': (t) => t.replace(`  deploy-www:\n    name: Publish the front page to Cloudflare Pages\n`, `  deploy-www:\n    name: Publish the front page to Cloudflare Pages\n    env:\n      K: \${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}\n`),
    'the test server override stays set on a push': (t) => t.replace(`SERVE_SUPABASE_URL: \${{ github.event_name == 'pull_request' && env.TARGET_URL || '' }}`, `SERVE_SUPABASE_URL: \${{ env.TARGET_URL }}`),
  };
  for (const [what, mutate] of Object.entries(mutations)) {
    const mutated = mutate(real);
    if (mutated === real) { console.error(`self-test FAILED: the mutation "${what}" did not change the file`); process.exit(1); }
    if (!check(mutated).length) { console.error(`self-test FAILED: "${what}" was not caught`); process.exit(1); }
  }
  console.log(`CI target rule: the real file passes and all ${Object.keys(mutations).length} deliberate breaks are caught.`);
  process.exit(0);
}

const problems = check(fs.readFileSync(FILE, 'utf8'));
if (problems.length) {
  console.error('\nCI target check FAILED\n');
  problems.forEach((p) => console.error('  • ' + p));
  process.exit(1);
}
console.log(`CI target rule OK: a pull request's browser suites use ${resolve('pull_request').toUpperCase()}, a push to main uses ${resolve('push').toUpperCase()}.`);
