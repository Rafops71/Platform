#!/usr/bin/env node
'use strict';
// Fails the build when a browser spec file that asserts about WHOLE tables is not in tests/e2e/exclusive-specs.js.
//
// WHY. With E2E_WORKERS above 1 (pull requests today) spec files run at the same moment against one shared database.
// A spec whose assertion is about a whole table (a count or a total over every row of listings, profiles, messages ...)
// is wrong the moment a neighbouring file adds a row, and fails only sometimes, only in parallel. The five files that do
// this are listed in tests/e2e/exclusive-specs.js and run alone; that list was kept by hand, and a new spec forgetting
// to join it would have been a flake nobody could explain. This is the check that stops it (second-opinion point on
// PR 142, supervisor's decision of 23 Nov 2026).
//
// WHAT IT LOOKS FOR, in every tests/e2e/*.spec.js that is not listed: a quoted or template string that is a SELECT with an
// aggregate (count, sum, avg, min, max) FROM one of the shared tables and has no WHERE. A spec that does this on purpose
// and is safe (it reads only a table nobody else writes while it runs, say) says so in a comment that starts
// "whole-table-ok:" followed by the reason; the reason is required.
// It also fails when a listed file no longer exists (renamed or deleted: the list would silently guard nothing).
//
//   node scripts/check-exclusive-specs.js            npm run check:exclusive (CI and npm run prepush)
//   node scripts/check-exclusive-specs.js --self-test

const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, '..', 'tests', 'e2e');
const SHARED = ['listings', 'profiles', 'messages', 'matches', 'notifications', 'activity_log', 'email_outbox', 'deals',
  'invitations', 'saved_searches', 'document_requests', 'document_checklist', 'terms_acceptances', 'message_forward_log'];
const AGGREGATE = /\b(count|sum|avg|min|max)\s*\(/i;
const FROM_SHARED = new RegExp(`\\bfrom\\s+(?:public\\.)?(${SHARED.join('|')})\\b`, 'i');
const OK_COMMENT = /whole-table-ok:[ \t]*\S+/;

/** Quoted strings and template strings of a source file (the SQL a spec sends is always one of these). */
function literals(src) {
  const out = [];
  const re = /`([^`]*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

/** The whole-table aggregates in one spec's source: the offending strings, shortened. */
function wholeTableQueries(src) {
  return literals(src)
    .filter((s) => /\bselect\b/i.test(s) && AGGREGATE.test(s) && FROM_SHARED.test(s) && !/\bwhere\b/i.test(s))
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 110));
}

function problemsIn(listed, files, read) {
  const p = [];
  for (const f of listed) if (!files.includes(f)) p.push(`tests/e2e/exclusive-specs.js lists ${f}, which does not exist (renamed or deleted?)`);
  for (const f of files) {
    if (listed.includes(f)) continue;
    const src = read(f);
    if (OK_COMMENT.test(src)) continue;
    for (const q of wholeTableQueries(src)) {
      p.push(`${f} counts a whole table ("${q}") but is not in tests/e2e/exclusive-specs.js. Add it there, or, if it is safe beside other files, add a comment "whole-table-ok: <why>".`);
    }
  }
  return p;
}

if (process.argv.includes('--self-test')) {
  const cases = [
    ['a count over a whole shared table in an unlisted file is caught',
      [[], ['a.spec.js'], () => "const r = await query('select count(*)::int n from public.listings');"], 1],
    ['the same query with a WHERE is fine',
      [[], ['a.spec.js'], () => "await query('select count(*)::int n from public.listings where user_id = $1', [id]);"], 0],
    ['a template string over a whole table is caught',
      [[], ['a.spec.js'], () => 'await query(`select sum(quantity) s\n from public.messages`);'], 1],
    ['a listed file is not asked',
      [['a.spec.js'], ['a.spec.js'], () => "query('select count(*) from public.profiles')"], 0],
    ['a whole-table-ok comment with a reason clears it',
      [[], ['a.spec.js'], () => "// whole-table-ok: only reads a table nobody else writes\nquery('select count(*) from public.profiles')"], 0],
    ['a whole-table-ok comment with no reason does not',
      [[], ['a.spec.js'], () => "// whole-table-ok:\nquery('select count(*) from public.profiles')"], 1],
    ['a table that is not shared is fine',
      [[], ['a.spec.js'], () => "query('select count(*) from public.terms_versions')"], 0],
    ['a listed file that no longer exists is caught',
      [['gone.spec.js'], ['a.spec.js'], () => ''], 1],
  ];
  let failed = 0;
  for (const [label, [listed, files, read], expected] of cases) {
    const n = problemsIn(listed, files, read).length;
    const ok = n === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (found ${n}, expected ${expected})`}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}

const listed = require(path.join(SPEC_DIR, 'exclusive-specs.js'));
const files = fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.js'));
const problems = problemsIn(listed, files, (f) => fs.readFileSync(path.join(SPEC_DIR, f), 'utf8'));
if (problems.length) {
  console.error('Exclusive-spec list check FAILED:\n' + problems.map((x) => '  - ' + x).join('\n'));
  process.exit(1);
}
console.log(`Exclusive-spec list: ${listed.length} listed files exist; none of the other ${files.length - listed.length} spec files counts a whole shared table.`);
