#!/usr/bin/env node
'use strict';
// npm run prepush - everything a builder can know before pushing, in one command.
//
// WHY (docs/FABLE-ORCHESTRATION-2026-11-16.md, fix 2 and rule 4). Most of the 54 red CI
// runs in the last 100 were knowable before the push. This runs, in order:
//   1. a search for merge-conflict markers in the tree
//   2. every offline check (seconds each), and the self-tests of the new ones
//   3. npm run test:sql (a throwaway PostgreSQL; as root it makes the user "pgtest" once)
//   4. the list of member-visible strings this branch changes, English and Spanish
// and prints one line per step plus that list. PASTE THE OUTPUT IN THE PULL REQUEST.
//
// It does NOT run the browser suites (they need .env and the live project) and says so
// at the end. Nothing printed here ticks a checklist item: only a named ItemNN test that
// passed in CI does.
//
//   npm run prepush                 all of it
//   npm run prepush -- --skip-sql   skip test:sql (the summary says NOT RUN and exits 3)
//   BASE_REF=main                   what "changed" is measured against (default main)

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_REF || 'main';
const skipSql = process.argv.includes('--skip-sql');
const results = [];

function run(label, cmd, args, opts = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  const ok = r.status === 0;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (${secs}s)`);
  if (!ok) {
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
    console.log(out.slice(-25).map(l => '        ' + l).join('\n'));
  }
  return r;
}

// ---- 1. conflict markers --------------------------------------------------
{
  const r = spawnSync('git', ['grep', '-nIE', '--untracked', '^(<<<<<<<|>>>>>>>) ', '--', '.', ':!node_modules'], { cwd: ROOT, encoding: 'utf8' });
  const hits = (r.stdout || '').trim();
  results.push({ label: 'no merge-conflict markers', ok: !hits });
  console.log(`${hits ? 'FAIL' : 'PASS'}  no merge-conflict markers in the tree`);
  if (hits) console.log(hits.split('\n').slice(0, 20).map(l => '        ' + l).join('\n'));
}

// ---- 2. offline checks ----------------------------------------------------
for (const name of ['guards', 'migrations', 'calls', 'client', 'i18n', 'double', 'errors', 'filters', 'language', 'terms', 'deploy', 'front-page']) {
  run(`npm run check:${name}`, 'npm', ['run', '-s', `check:${name}`]);
}
run('migration numbers: self-test', 'node', ['scripts/check-migration-lists.js', '--self-test']);
run('new migrations carry an applied-probe', 'node', ['scripts/check-applied-live.js', '--lint'], { env: { ...process.env, BASE_REF: BASE } });
run('applied-probe: self-test', 'node', ['scripts/check-applied-live.js', '--self-test']);
run('no test asserts on a hidden element', 'node', ['scripts/check-test-hidden.js']);
run('CI database targets (PR=staging, push=live, staging takes turns)', 'node', ['scripts/check-ci-targets.js']);
run('CI database targets: self-test', 'node', ['scripts/check-ci-targets.js', '--self-test']);
run('hidden-element lint: self-test', 'node', ['scripts/check-test-hidden.js', '--self-test']);
run('picture-job filter: self-test', 'node', ['scripts/layout-changed.js', '--self-test']);
run('browser-suites filter (documents-only pull requests): self-test', 'node', ['scripts/browser-suites-needed.js', '--self-test']);
run('nightly backup workflow: guard', 'node', ['scripts/check-backup-workflow.js']);
run('nightly backup workflow: guard self-test', 'node', ['scripts/check-backup-workflow.js', '--self-test']);
run('backup repository script: self-test (local git repository)', 'node', ['scripts/test-backup-repo.js']);

// ---- 3. test:sql ----------------------------------------------------------
if (skipSql) {
  results.push({ label: 'npm run test:sql', ok: false, skipped: true });
  console.log('SKIP  npm run test:sql  - NOT RUN (--skip-sql). Say so in the pull request; do not tick anything.');
} else if (typeof process.getuid === 'function' && process.getuid() === 0) {
  // PostgreSQL will not start as root (CLAUDE.md, "Running things"): use an ordinary user.
  spawnSync('sh', ['-c', 'getent passwd pgtest >/dev/null || useradd -m pgtest; chown -R pgtest:pgtest node_modules/@embedded-postgres'], { cwd: ROOT });
  run('npm run test:sql (as user pgtest)', 'su', ['pgtest', '-c', `cd ${ROOT} && npm run test:sql`]);
} else {
  run('npm run test:sql', 'npm', ['run', '-s', 'test:sql']);
}

// The staging-Operator tool proves itself against a throwaway PostgreSQL too (non-root, like test:sql).
if (!skipSql) {
  if (typeof process.getuid === 'function' && process.getuid() === 0) run('staging Operator tool: self-test (as user pgtest)', 'su', ['pgtest', '-c', `cd ${ROOT} && node scripts/staging-operator.js --self-test`]);
  else run('staging Operator tool: self-test', 'node', ['scripts/staging-operator.js', '--self-test']);
}

// ---- 4. strings this branch changes ---------------------------------------
function git(...a) { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }

/** { en: {key: raw value}, es: {...} } read from js/i18n.js text. */
function readStrings(src) {
  const out = { en: {}, es: {} };
  let lang = null;
  for (const line of src.split('\n')) {
    if (/^  en: \{/.test(line)) lang = 'en';
    else if (/^  es: \{/.test(line)) lang = 'es';
    else if (/^  \},?\s*$/.test(line)) lang = null;
    const m = lang && /^\s+'([^']+)':\s*(.*?),?\s*$/.exec(line);
    if (m) out[lang][m[1]] = m[2];
  }
  return out;
}

console.log(`\n=== Member-visible strings changed since ${BASE} (js/i18n.js) ===`);
const baseSrc = git('show', `origin/${BASE}:js/i18n.js`) ?? git('show', `${BASE}:js/i18n.js`);
if (baseSrc == null) {
  console.log(`(cannot read js/i18n.js on ${BASE} here - list not produced)`);
} else {
  const before = readStrings(baseSrc);
  const after = readStrings(fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8'));
  let n = 0;
  for (const lang of ['en', 'es']) {
    const keys = new Set([...Object.keys(before[lang]), ...Object.keys(after[lang])]);
    for (const k of [...keys].sort()) {
      const a = before[lang][k], b = after[lang][k];
      if (a === b) continue;
      n++;
      if (a === undefined) console.log(`  ${lang.toUpperCase()} NEW      ${k}: ${b}`);
      else if (b === undefined) console.log(`  ${lang.toUpperCase()} REMOVED  ${k}: ${a}`);
      else console.log(`  ${lang.toUpperCase()} CHANGED  ${k}\n      was: ${a}\n      now: ${b}`);
    }
  }
  if (!n) console.log('  (none)');
}
const htmlDiff = (git('diff', '-U0', `origin/${BASE}`, '--', '*.html') ?? '').split('\n').filter(l => /^[+-]\s*[^+\-\s]/.test(l) && !/^(\+\+\+|---)/.test(l));
console.log(`\n=== HTML lines changed since ${BASE} (read them for member-visible words) ===`);
console.log(htmlDiff.length ? htmlDiff.slice(0, 80).map(l => '  ' + l.slice(0, 180)).join('\n') + (htmlDiff.length > 80 ? `\n  ... and ${htmlDiff.length - 80} more` : '') : '  (none)');
console.log('(Terms wording lives in terms.html and terms/changes/: it shows above as HTML lines.)');

// ---- summary ---------------------------------------------------------------
const failed = results.filter(r => !r.ok && !r.skipped);
const skipped = results.filter(r => r.skipped);
console.log('\n=== Summary ===');
console.log(`${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} not run.`);
console.log('NOT covered by this command: the browser suites (npm run e2e / checklist: need .env and the live project),');
console.log('the pictures, and the second opinion. Anything not proven by a named ItemNN test in CI is "written, not yet run".');
process.exit(failed.length ? 1 : skipped.length ? 3 : 0);
