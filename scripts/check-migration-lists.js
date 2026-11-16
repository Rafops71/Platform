#!/usr/bin/env node
//
// Fails if the migrations the tests apply and the migrations a deployment
// applies are not the same set.
//
// Two files hold that list:
//
//   scripts/apply-sql.js   DEFAULT_ORDER  - what a real database gets
//   scripts/pg-harness.js  SETUP          - what the test suite runs against
//
// A comment above DEFAULT_ORDER has said since it was written that if a
// migration is added to one and not the other, the tests stop describing the
// database anyone actually deploys. That is exactly what happened: on
// 2026-10-12 the harness applied 21 migrations and the deploy script applied
// 16. Five were missing from deployment - the function lockdown, the profile
// deletion fix, the rate-limit race fix and the foreign-key indexes - and
// every test still passed, because the tests were reading the complete list.
//
// A comment cannot enforce itself. This can, and it costs a second.
//
// It compares SETS, not order: the two files legitimately differ in order and
// in what else they contain (the harness has no seed data; the deploy script
// does), so only the numbered migrations are compared.

const fs = require('fs');

/** Every 0NN_*.sql named in a file, in the order it appears, once each.
 *
 *  Comments are stripped first: both files carry usage examples that name a
 *  migration ("node scripts/apply-sql.js 002_updates.sql ..."), and counting
 *  those made this check report a bogus ordering difference the first time it
 *  ran. De-duplicated as well, since a list naming the same migration twice is
 *  a mistake in its own right rather than a disagreement between the two. */
function migrationsIn(file) {
  const src = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const found = [...src.matchAll(/(\d{3}_[a-z0-9_]+\.sql)/g)].map(m => m[1]);
  return [...new Set(found)];
}

const deploy = migrationsIn('scripts/apply-sql.js');
const tests = migrationsIn('scripts/pg-harness.js');

const inTestsOnly = tests.filter(m => !deploy.includes(m));
const inDeployOnly = deploy.filter(m => !tests.includes(m));

if (inTestsOnly.length || inDeployOnly.length) {
  console.error('\nMigration list check FAILED\n');
  if (inTestsOnly.length) {
    console.error('  Tested but never deployed — the suite is proving a database');
    console.error('  that nobody runs:');
    inTestsOnly.forEach(m => console.error(`    • ${m}`));
    console.error('  Add each to DEFAULT_ORDER in scripts/apply-sql.js.\n');
  }
  if (inDeployOnly.length) {
    console.error('  Deployed but never tested — shipped without a suite ever');
    console.error('  running against it:');
    inDeployOnly.forEach(m => console.error(`    • ${m}`));
    console.error('  Add each to SETUP in scripts/pg-harness.js.\n');
  }
  process.exit(1);
}

// Order matters too: a migration that alters what an earlier one created will
// fail, or silently do the wrong thing, if the two files disagree about which
// came first.
const deployOrder = deploy.join(',');
const testOrder = tests.join(',');
if (deployOrder !== testOrder) {
  console.error('\nMigration list check FAILED\n');
  console.error('  Both files list the same migrations but in a different order.');
  console.error(`    deploy: ${deployOrder}`);
  console.error(`    tests:  ${testOrder}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Numbers: no repeat, no skip, and sql/NEXT is exactly one more than the highest.
// (docs/FABLE-ORCHESTRATION-2026-11-16.md, fix 1.) 050 was left free on purpose on
// 8 Nov (docs/BATCH-2026-11-08.md) and never used; it is the one allowed gap.
const KNOWN_GAPS = new Set(['050']);
function checkNumbers(files, nextRaw) {
  const problems = [];
  const nums = files.map(f => f.slice(0, 3));
  const seen = new Set();
  for (const n of nums) { if (seen.has(n)) problems.push(`number ${n} is used by more than one migration`); seen.add(n); }
  const ints = [...seen].map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ints.length; i++) {
    for (let n = ints[i - 1] + 1; n < ints[i]; n++) {
      const pad = String(n).padStart(3, '0');
      if (!KNOWN_GAPS.has(pad)) problems.push(`number ${pad} is skipped (between ${ints[i - 1]} and ${ints[i]})`);
    }
  }
  const highest = ints[ints.length - 1];
  const want = String(highest + 1).padStart(3, '0');
  if (nextRaw !== want) problems.push(`sql/NEXT says ${nextRaw}, but the highest migration is ${String(highest).padStart(3, '0')}, so it must say ${want} (use: npm run migration:next -- reserve <name>)`);
  return problems;
}

if (process.argv.includes('--self-test')) {
  const t = (files, next, expectProblems) => {
    const got = checkNumbers(files, next).length > 0;
    if (got !== expectProblems) { console.error(`self-test FAILED for ${files.join(',')} next=${next}`); process.exit(1); }
  };
  t(['002_a.sql', '003_b.sql'], '004', false);
  t(['002_a.sql', '003_b.sql', '003_c.sql'], '004', true);   // repeated
  t(['002_a.sql', '004_b.sql'], '005', true);                // skipped
  t(['049_a.sql', '051_b.sql'], '052', false);               // the one allowed gap
  t(['002_a.sql', '003_b.sql'], '003', true);                // NEXT behind
  t(['002_a.sql', '003_b.sql'], '009', true);                // NEXT ahead
  console.log('Migration number checks: 6 self-tests pass.');
  process.exit(0);
}

const numbered = fs.readdirSync('sql').filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();
const numberProblems = checkNumbers(numbered, fs.readFileSync('sql/NEXT', 'utf8').trim());
if (numberProblems.length) {
  console.error('\nMigration number check FAILED\n');
  numberProblems.forEach(p => console.error(`  • ${p}`));
  console.error('');
  process.exit(1);
}

console.log(`Migration lists: ${deploy.length} migrations, deploy and tests agree. OK.`);
