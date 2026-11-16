#!/usr/bin/env node
'use strict';
// "Is the migration applied live?" - answered in seconds, before the browser suite.
//
// WHY (docs/FABLE-ORCHESTRATION-2026-11-16.md, fix 3). The checklist runs against the
// LIVE project, so a pull request that carries a migration is red until that
// migration has been applied live. The order "apply, then open the PR" was only a
// habit, and a missing apply cost a full browser run to discover (#114).
//
// HOW. The live database keeps no list of applied migrations (apply-sql.yml does not
// write one; ops.applied_sql exists on staging only), so the migration says for itself
// how to tell. Every migration ADDED by a pull request carries one header line:
//
//     -- applied-probe: select exists(select 1 from information_schema.columns where table_name = 'listings' and column_name = 'readiness')
//
// A single read-only SELECT that returns exactly one row with one boolean, true once the
// migration is live. This script runs each probe inside a READ ONLY transaction on the
// live database and fails with "migration NNN not applied live" when it returns false.
// Migrations that already exist on the base branch are not asked for a probe.
//
//   node scripts/check-applied-live.js            CI: files added versus origin/$BASE_REF
//   node scripts/check-applied-live.js --lint     offline: every probe is well-formed (prepush)
//   node scripts/check-applied-live.js --self-test
//
// On a push to main (no base to compare with) it says so and passes: a pull request
// reached main only after this ran on it.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROBE = /^--\s*applied-probe:\s*(.+?)\s*$/m;

/** The probe in a migration's text: one SELECT, nothing else. Returns { sql } or { problem }. */
function readProbe(text) {
  const m = PROBE.exec(text);
  if (!m) return { problem: 'has no "-- applied-probe: select ..." header line' };
  const sql = m[1].replace(/;\s*$/, '');
  if (!/^select\s/i.test(sql)) return { problem: 'its applied-probe must be a single select' };
  if (sql.includes(';')) return { problem: 'its applied-probe must be one statement (no ";")' };
  if (/--|\/\*/.test(sql)) return { problem: 'its applied-probe must not contain comments' };
  return { sql };
}

/** sql/NNN_name.sql files added since the base: the only ones asked for a probe. */
function addedMigrations(baseRef) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  try { git('fetch', '--no-tags', '--depth=1', 'origin', baseRef); } catch (e) { /* already present */ }
  // Compared with the working tree, so a migration not yet committed is seen by prepush too;
  // in CI the tree is HEAD, so it is the same thing.
  const out = git('diff', '--name-only', '--diff-filter=A', `origin/${baseRef}`, '--', 'sql/')
    + git('ls-files', '--others', '--exclude-standard', '--', 'sql/');
  return out.split('\n').filter(f => /^sql\/\d{3}_[^/]*\.sql$/.test(f) && !/_revert\.sql$/.test(f));
}

function allMigrations() {
  return fs.readdirSync(path.join(ROOT, 'sql')).filter(f => /^\d{3}_.*\.sql$/.test(f) && !/_revert\.sql$/.test(f)).map(f => `sql/${f}`);
}

/** Ask one probe inside a READ ONLY transaction: a probe written in a pull request can read,
 *  never write. Returns the single boolean, or null when it did not return exactly one row. */
async function askProbe(client, sql) {
  await client.query('begin read only');
  try { const r = await client.query(sql); return r.rows.length === 1 ? Object.values(r.rows[0])[0] : null; }
  finally { await client.query('rollback'); }
}

async function main(argv) {
  if (argv.includes('--self-test-db')) {
    // Against a throwaway local PostgreSQL (needs a non-root user, like test:sql).
    const { start } = require('./pg-harness');
    const pg = await start();
    try {
      const yes = await askProbe(pg.client, "select exists(select 1 from information_schema.columns where table_name = 'listings' and column_name = 'readiness')");
      const no = await askProbe(pg.client, "select exists(select 1 from information_schema.columns where table_name = 'listings' and column_name = 'no_such_column')");
      let blocked = false;
      await pg.client.query('create sequence public.t_probe_seq');
      // nextval() writes, so a probe that calls it must be refused by the read-only transaction.
      try { await askProbe(pg.client, "select nextval('public.t_probe_seq') > 0"); }
      catch (e) { blocked = /read-only transaction/.test(e.message); }
      const rows = (await pg.client.query('select count(*)::int n from public.listings')).rows[0].n;
      const results = { 'a true probe reads true': yes === true, 'a false probe reads false': no === false, 'a write inside a probe is refused': blocked, 'the connection is usable afterwards': rows >= 0 };
      let bad = 0;
      for (const [k, v] of Object.entries(results)) { console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`); if (!v) bad++; }
      return bad ? 1 : 0;
    } finally { await pg.stop(); }
  }

  if (argv.includes('--self-test')) {
    const ok = (t, expectSql) => { const r = readProbe(t); if (!!r.sql !== expectSql) { console.error('self-test FAILED on: ' + t); process.exit(1); } };
    ok('-- applied-probe: select true', true);
    ok('-- applied-probe: select exists(select 1 from t where a = 1);', true);
    ok('-- nothing here', false);
    ok('-- applied-probe: delete from t', false);
    ok('-- applied-probe: select 1; drop table t', false);
    ok('-- applied-probe: select 1 -- sneaky', false);
    console.log('Applied-live probe checks: 6 self-tests pass.');
    return 0;
  }

  if (argv.includes('--lint')) {
    // Offline: no database. Only the migrations this branch adds (needs a base to compare
    // with); with no base ref, say so rather than ask the 66 old migrations for probes.
    const base = process.env.BASE_REF || 'main';
    let added;
    try { added = addedMigrations(base); } catch (e) { console.log(`Applied-live probes: cannot compare with origin/${base} here (${e.message.split('\n')[0]}); not checked.`); return 0; }
    const bad = added.map(f => ({ f, r: readProbe(fs.readFileSync(path.join(ROOT, f), 'utf8')) })).filter(x => x.r.problem);
    bad.forEach(x => console.error(`  • ${x.f} ${x.r.problem}`));
    if (bad.length) return 1;
    console.log(`Applied-live probes: ${added.length} new migration(s), each with a well-formed probe. OK.`);
    return 0;
  }

  const base = process.env.BASE_REF;
  if (!base) { console.log('Applied-live check: no base branch (a push, not a pull request); nothing to compare. OK.'); return 0; }
  const added = addedMigrations(base);
  if (!added.length) { console.log('Applied-live check: this pull request adds no migration. OK.'); return 0; }

  const probes = added.map(f => ({ f, ...readProbe(fs.readFileSync(path.join(ROOT, f), 'utf8')) }));
  const bad = probes.filter(p => p.problem);
  if (bad.length) { bad.forEach(p => console.error(`::error::${p.f} ${p.problem}`)); return 1; }

  const { Client } = require('pg');
  if (!process.env.SUPABASE_DB_URL) { console.error('::error::SUPABASE_DB_URL is not set; cannot ask the live database.'); return 1; }
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await client.connect();
  let failed = 0;
  try {
    for (const p of probes) {
      const n = path.basename(p.f).slice(0, 3);
      if (await askProbe(client, p.sql) === true) console.log(`  OK  migration ${n} is applied live (${path.basename(p.f)})`);
      else { failed++; console.error(`::error::migration ${n} not applied live (${path.basename(p.f)}). Apply it with apply-sql.yml (ref = this branch), read it back, then re-run.`); }
    }
  } finally { await client.end(); }
  return failed ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(e.message); process.exit(1); });
module.exports = { readProbe };
