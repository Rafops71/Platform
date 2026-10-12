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

console.log(`Migration lists: ${deploy.length} migrations, deploy and tests agree. OK.`);
