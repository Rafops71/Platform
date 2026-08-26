#!/usr/bin/env node
// Run one SQL statement against the live database and print the result.
//
// This exists because ad-hoc inspection was being done as long `node -e`
// one-liners that re-implemented .env parsing and pg setup every time — each
// one a fresh chance to mis-escape a quote inside a shell inside a JS string.
//
// Usage:
//   node scripts/q.js "select count(*) from public.listings"
//   node scripts/q.js "select * from public.profiles where role = \$1" operator
//   node scripts/q.js --json "select * from public.commodities"
//   echo "select 1" | node scripts/q.js
//
// Arguments after the statement become $1, $2, … so values never have to be
// concatenated into the SQL.
//
// Read-only by habit but not by enforcement: this connects with the same
// credentials as apply-sql.js and will happily run a DELETE. Prefer a
// migration in sql/ for anything that changes data.

'use strict';

const { connect } = require('./db');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const rest = argv.filter(a => a !== '--json');
const [sql, ...params] = rest;

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

/** Plain column-aligned table. Values are printed as-is; nulls show as ø so
 *  an empty string and a null are told apart. */
function printTable(rows) {
  const cols = Object.keys(rows[0]);
  const show = v => (v === null || v === undefined ? 'ø' : String(v));
  const width = {};
  cols.forEach(c => {
    width[c] = Math.max(c.length, ...rows.map(r => show(r[c]).length));
  });

  console.log(cols.map(c => c.padEnd(width[c])).join(' | '));
  console.log(cols.map(c => '-'.repeat(width[c])).join('-+-'));
  rows.forEach(r => console.log(cols.map(c => show(r[c]).padEnd(width[c])).join(' | ')));
}

async function main() {
  const statement = sql || await readStdin();
  if (!statement) {
    console.error('Usage: node scripts/q.js "<sql>" [param…] [--json]');
    process.exit(1);
  }

  const client = await connect();
  try {
    const res = await client.query(statement, params);

    if (asJson) {
      console.log(JSON.stringify(res.rows, null, 2));
    } else if (!res.rows || res.rows.length === 0) {
      // Statements like UPDATE report affected rows instead of a result set.
      console.log(res.rowCount === null ? 'OK' : `OK — ${res.rowCount} row(s) affected`);
    } else {
      printTable(res.rows);
      console.log(`\n(${res.rows.length} row${res.rows.length === 1 ? '' : 's'})`);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
