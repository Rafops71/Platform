#!/usr/bin/env node
'use strict';
// Reserve the next migration number, from a file and not from anyone's memory.
//
//   npm run migration:next                 show the number that is next
//   npm run migration:next -- reserve NAME reserve it: prints the file names to use
//                                          and moves sql/NEXT on by one
//
// WHY. On 8 Nov two branches each took 048 and 049, and a 050 had to run after
// 057, because numbers were handed out by hand (docs/FABLE-ORCHESTRATION-2026-11-16.md,
// fix 1). sql/NEXT is committed, so two branches that both reserve the same number
// also both change the same line - git then reports a conflict instead of letting
// the collision through. `npm run check:migrations` fails when sql/NEXT is not
// exactly one more than the highest migration, or when a number is repeated or skipped.

const fs = require('fs');
const path = require('path');

const NEXT_FILE = path.join(__dirname, '..', 'sql', 'NEXT');

function readNext() {
  const raw = fs.readFileSync(NEXT_FILE, 'utf8').trim();
  if (!/^\d{3}$/.test(raw)) throw new Error(`sql/NEXT must hold one three-digit number, found "${raw}"`);
  return raw;
}

function main(argv) {
  const [cmd, name] = argv;
  const next = readNext();
  if (!cmd) { console.log(`Next migration number: ${next}`); return 0; }
  if (cmd !== 'reserve' || !/^[a-z0-9_]+$/.test(name || '')) {
    console.error('Usage: npm run migration:next -- reserve <name_with_underscores>');
    return 2;
  }
  const bumped = String(Number(next) + 1).padStart(3, '0');
  fs.writeFileSync(NEXT_FILE, `${bumped}\n`);
  console.log(`Reserved ${next}. Create:`);
  console.log(`  sql/${next}_${name}.sql`);
  console.log(`  sql/revert/${next}_${name}_revert.sql`);
  console.log(`  sql/tests/NN_${name}.sql  (and add all three to scripts/apply-sql.js, pg-harness.js, run-sql-tests.js)`);
  console.log(`sql/NEXT now says ${bumped}. Commit it with the migration.`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { readNext };
