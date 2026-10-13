#!/usr/bin/env node
'use strict';

// A member is never shown the database's own words.
//
// WHY THIS EXISTS
//
// Captured from the live project on 2026-10-13, an action a member is not
// permitted to take answers:
//
//   new row violates row-level security policy for table "listings"
//
// Fifty-nine places in this interface put whatever came back on the screen.
// That sentence reads as a crash when the system is working exactly as
// designed, means nothing to a trader, and names an internal table to the
// person who was just refused - on a platform whose product is secrecy.
//
// errorMessage() in js/utils.js translates the codes. This runs that real
// function against real error objects and checks what comes out. It is not a
// reading of the code: the function is loaded and called.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// A browser-ish sandbox: enough for i18n.js and utils.js, nothing more.
const sandbox = {
  console: { error() {}, warn() {}, log() {} },
  document: { documentElement: {} },
  window: {},
  TypeError,
};
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ['js/i18n.js', 'js/utils.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

// Exactly what the live API returned, kept verbatim.
const LIVE_RLS = {
  code: '42501',
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "listings"',
};

const cases = [
  ['a refusal (42501, captured live)', LIVE_RLS],
  ['a duplicate (23505)', { code: '23505', message: 'duplicate key value violates unique constraint "saved_searches_unique"' }],
  ['a missing parent row (23503)', { code: '23503', message: 'insert or update on table "messages" violates foreign key constraint "messages_listing_id_fkey"' }],
  ['a required field (23502)', { code: '23502', message: 'null value in column "body" of relation "messages" violates not-null constraint' }],
  ['a check constraint (23514)', { code: '23514', message: 'new row for relation "listings" violates check constraint "listings_status_check"' }],
  ['an expired session (PGRST301)', { code: 'PGRST301', message: 'JWT expired' }],
  ['no connection', new TypeError('Failed to fetch')],
];

// Anything that would tell a member how the database is built.
const LEAKS = /row-level security|relation "|table "|constraint|null value in column|violates|JWT|PGRST|schema cache/i;

const problems = [];

for (const [what, err] of cases) {
  const shown = sandbox.errorMessage(err);
  if (LEAKS.test(shown)) {
    problems.push(`${what} is shown to the member as: "${shown}"`);
  }
  if (!shown || shown.length < 8) {
    problems.push(`${what} produced nothing useful: "${shown}"`);
  }
}

// An unknown code must still say SOMETHING rather than "undefined".
const unknown = sandbox.errorMessage({ code: 'XX999', message: 'something nobody has seen before' });
if (!unknown || unknown === 'undefined') {
  problems.push(`an unrecognised error produced: "${unknown}"`);
}

if (problems.length) {
  console.error('\nFAIL — the database is speaking directly to a member:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('\nMap the code in errorMessage() (js/utils.js) and give it a phrase in both languages.\n');
  process.exit(1);
}

console.log(`OK — ${cases.length} failure kinds, none of them shows a member the database's own words.`);
