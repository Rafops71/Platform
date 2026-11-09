#!/usr/bin/env node
'use strict';

// The browser code must reach the database only through the client that
// js/supabase-config.js declares.
//
// WHY THIS EXISTS. When the platform was renamed, the client variable changed
// from `jericho` to `myplatform`. A branch that was written before the rename
// and merged after it still called `jericho.rpc(...)`. Git merged it with no
// conflict, `node --check` passed it, and check:calls ignores method calls, so
// nothing flagged it: the Operator page threw "jericho is not defined" the
// moment a browser reached the line, and the whole tab never loaded.
//
// WHAT IT DOES. Reads the client's name from js/supabase-config.js, then looks
// in every file under js/ for `X.from(`, `X.rpc(`, `X.auth.` and `X.storage.`
// where X is anything else. It is not a parser: it reads text, and a different
// receiver with one of those method names would need to be listed in ALLOWED.

const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', 'js');
const config = fs.readFileSync(path.join(JS, 'supabase-config.js'), 'utf8');
const declared = (config.match(/\bconst\s+(\w+)\s*=\s*window\.supabase\.createClient\(/) || [])[1];
if (!declared) {
  console.error('FAIL - js/supabase-config.js does not declare the client with "const NAME = window.supabase.createClient(".');
  process.exit(1);
}

// Receivers that are not the client but share a method name. Add here, with a reason.
// Array.from( is JavaScript's own, not a database call.
const ALLOWED = new Set(['Array']);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
}

const problems = [];
let calls = 0;
for (const file of files(JS)) {
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\.(from\(|rpc\(|auth\.|storage\.)/g)) {
      calls += 1;
      const receiver = m[1];
      if (receiver !== declared && !ALLOWED.has(receiver)) {
        problems.push(`${path.relative(path.join(__dirname, '..'), file)}:${i + 1}: "${receiver}.${m[2]}" - the client is "${declared}"`);
      }
    }
  });
}

if (problems.length) {
  console.error(`FAIL - ${problems.length} call(s) to a database client that is not "${declared}":`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`OK - ${calls} database calls in js/, every one through "${declared}".`);
