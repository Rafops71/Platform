#!/usr/bin/env node
// Run sql/tests/01_security_suite.sql against a throwaway local PostgreSQL.
//
//   npm run test:sql
//
// Why this exists: the security suite has caught two real bugs (a privilege
// escalation, and forwarded messages silently never arriving), but it needed
// a local PostgreSQL that this machine did not have, so it went unrun while
// migrations 003-007 were applied straight to production. This makes it a
// one-command check with no Docker, no admin rights and no system install:
// embedded-postgres downloads real PostgreSQL binaries into node_modules.
//
// Those binaries include initdb/pg_ctl/postgres but NOT psql, and the suite
// is written for psql — so its backslash meta-commands are translated here
// rather than executed. Only three appear in it: \echo becomes a printed
// heading, \pset and \set QUIET are display settings with no meaning outside
// psql and are dropped.
//
// Exit code is 0 only if every assertion printed PASS.

'use strict';

const fs = require('fs');
const path = require('path');
const {
  start: startPostgres,
  translateMetaCommands,
  splitStatements,
  DEFAULT_PORT,
} = require('./pg-harness');

const ROOT = path.join(__dirname, '..');
let PORT = DEFAULT_PORT;   // settled by the harness before anything starts

// The schema, the migrations and the seed data are applied by
// scripts/pg-harness.js, which owns that list because the stress test needs
// the same database.

// Each suite runs against the same freshly-built database, in order. 02
// depends on nothing 01 leaves behind — it creates its own users — but it
// does read email_outbox, so it filters by its own addresses rather than
// counting rows globally.
const SUITES = [
  'sql/tests/01_security_suite.sql',
  'sql/tests/02_email_language.sql',
  'sql/tests/03_message_threading.sql',
  'sql/tests/04_terms_acceptance.sql',
  'sql/tests/05_profile_self_service.sql',
  'sql/tests/06_saved_searches.sql',
  'sql/tests/07_activity_export.sql',
  'sql/tests/08_listing_renewal.sql',
  'sql/tests/09_operator_analytics.sql',
  'sql/tests/10_rate_limits.sql',
  // 11 asserts who may CALL a function, not what one returns. It must run after
  // every migration has been applied, which it does — SETUP finishes first.
  'sql/tests/11_function_access.sql',
  'sql/tests/12_remaining_gaps.sql',
  // 13 deletes a member, so it runs last: its fixture leaves the shared
  // database short of one profile and a listing, and an earlier suite that
  // counted rows globally would see the gap.
  'sql/tests/13_profile_deletion.sql',
  'sql/tests/14_activity_log_purge.sql',
  'sql/tests/15_reference_overflow.sql',
  'sql/tests/16_invitation_required.sql',
  'sql/tests/17_browse_requires_approval.sql',
  'sql/tests/18_activity_log_write_only.sql',
  'sql/tests/19_signing_and_acceptance.sql',
  'sql/tests/20_listing_statements.sql',
  'sql/tests/21_deal_files.sql',
  'sql/tests/22_member_scorecard.sql',
  'sql/tests/23_email_unit_as_typed.sql',
  'sql/tests/24_door_inventory.sql',
  'sql/tests/25_welcome_seen.sql',
];

/** An assertion is any single-row result whose first column is named "Tn …"
 *  and whose value starts PASS or FAIL. Everything else is a side effect. */
function readAssertion(res) {
  if (!res || !res.fields || !res.rows || res.rows.length === 0) return null;
  const name = res.fields[0].name;
  const value = res.rows[0][name];
  if (name === '__echo') return { heading: value };
  if (typeof value !== 'string' || !/^(PASS|FAIL)/.test(value)) return null;
  return { name, value, passed: value.startsWith('PASS') };
}

/** Every assertion a suite file declares, by its `as "T…"` label.
 *
 *  WHY THIS EXISTS. An assertion that raises an error produces no row, and
 *  the loop below skips errors on purpose - most of them are the expected
 *  rejections the suite exists to provoke. So a typo in an assertion did not
 *  fail; it vanished, and the run still ended "All assertions passed."
 *  Found on 2026-10-25: sql/tests/14 T22 had carried a stray second FROM
 *  clause since 2026-10-13 and had never once run, while every run was green.
 *  Comparing what each file declares against what actually reported is the
 *  only way to tell "passed" from "never ran".
 *
 *  Labels are cut to 63 bytes because PostgreSQL truncates identifiers to
 *  NAMEDATALEN-1, so a long label comes back shorter than it is written - cut
 *  on a character boundary, as PostgreSQL does. Line comments are removed
 *  first so an example label in a comment is not mistaken for a test. */
function declaredAssertions(sqlText) {
  const code = sqlText.replace(/--[^\n]*/g, '');
  const out = [];
  for (const m of code.matchAll(/\bas\s+"(T\d+[a-z]?\b[^"]*)"/g)) out.push(truncateIdent(m[1]));
  return out;
}

function truncateIdent(label) {
  const buf = Buffer.from(label, 'utf8');
  if (buf.length <= 63) return label;
  let end = 63;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;   // never split a character
  return buf.subarray(0, end).toString('utf8');
}

async function main() {
  // The harness picks the port, starts the server and applies the schema, the
  // migrations and the seed data. It is shared with scripts/stress-test.js so
  // both run against the same database this platform actually has.
  const pg = await startPostgres();
  PORT = pg.port;
  const client = pg.client;

  let failed = 0;
  let neverRan = 0;
  try {
    // One statement at a time, in autocommit, exactly as psql would run it.
    // The suite deliberately performs statements that must be rejected — a
    // participant setting an operator-only status, for instance — and then
    // asserts the row was left alone. Running the file as a single query put
    // all of it in one transaction, where the first expected error aborted
    // every assertion after it.
    for (const suite of SUITES) {
      const rawSql = fs.readFileSync(path.join(ROOT, suite), 'utf8');
      const suiteSql = translateMetaCommands(rawSql);
      const declared = declaredAssertions(rawSql);
      // Counted, not a set: with a set, two assertions sharing a label would
      // let one report for both, hiding the other. (Raised by the second-opinion
      // reviewer on PR #16 - in reverse: it worried about double counting.)
      const reported = new Map();
      const note = (n) => reported.set(n, (reported.get(n) || 0) + 1);

      for (const statement of splitStatements(suiteSql)) {
        let res;
        try {
          res = await client.query(statement);
        } catch (err) {
          // Expected rejections land here. They are the point of the test, and
          // the assertion that follows is what decides pass or fail. Run with
          // SQL_TEST_VERBOSE=1 to see them — an assertion failing for a boring
          // reason (a renamed value the suite still uses) looks identical to a
          // real regression until you can read the error underneath it.
          if (process.env.SQL_TEST_VERBOSE) {
            console.log(`  · rejected: ${err.message}`);
            console.log(`      ${statement.replace(/\s+/g, ' ').slice(0, 120)}`);
          }
          continue;
        }

        const item = readAssertion(res);
        if (!item) continue;
        if (item.heading !== undefined) {
          console.log(item.heading ? `\n${item.heading}` : '');
        } else if (item.passed) {
          note(item.name);
          console.log(`  PASS  ${item.name}`);
        } else {
          note(item.name);
          failed++;
          console.log(`  FAIL  ${item.name}  ->  ${item.value}`);
        }
      }

      // Anything this file declared that never reported is a failure, not a
      // silence. Its statement errored before it could produce a row.
      for (const name of declared) {
        const left = reported.get(name) || 0;
        if (left > 0) { reported.set(name, left - 1); continue; }
        neverRan++;
        console.log(`  FAIL  ${name}  ->  NEVER RAN: this assertion errored and produced no result (${suite})`);
      }
    }
  } finally {
    await pg.stop();
  }

  const total = failed + neverRan;
  if (total === 0) console.log('\nAll assertions passed.');
  else console.log(`\n${failed} assertion(s) FAILED, ${neverRan} NEVER RAN.`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch(err => {
  // embedded-postgres can reject with no value at all, notably when the server
  // fails to start. Reading .message off that throws inside the handler, which
  // replaced the real failure with a TypeError and sent whoever hit it looking
  // in entirely the wrong place.
  const detail = (err && (err.message || err.code)) || err || 'no error detail was provided';
  console.error('\nERROR:', detail);

  // The common cause is a postmaster from an earlier run that outlived its
  // cleanup and still owns the port. Say so, rather than leaving it to be
  // deduced from the Postgres log above.
  console.error(
    `\nIf the server failed to start, check whether port ${PORT} is still held ` +
    `by a Postgres left over from an earlier run, and stop it. ` +
    `Set SQL_TEST_PORT to use a different port.`
  );
  process.exit(1);
});
