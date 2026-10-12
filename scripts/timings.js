#!/usr/bin/env node
//
// Print what the volume tests measured, on a run that PASSED.
//
// The browser suite runs with Playwright's JSON reporter, which captures each
// test's stdout into checklist-results.json instead of letting it reach the
// terminal. .github/workflows/ci.yml uploads that file only `if: failure()`,
// which is the right rule for failure evidence and the wrong one for this: the
// volume tests print how long every screen took to render, and on a green run
// those numbers were written down and then thrown away.
//
// That is backwards. A timing is most useful exactly when nothing is broken,
// because it is the thing you compare against next month. "Did it pass" is a
// yes or no; "the Operator mailbox drew 250 messages in 2.1 seconds" is the
// number that tells you when it starts getting worse.
//
// So this reads the report after a successful run and prints the measurements
// back out. It never fails a build: no file, no matches, nothing to say - it
// says so and exits 0.

'use strict';

const fs = require('fs');

const REPORT = 'checklist-results.json';

// Lines worth surfacing: the timing lines the volume specs print, and the
// seeding summaries that say what those timings were measured against.
const INTERESTING = /^\s*(\d+)\s*ms\s+\S|seeded |Operator screens:|rows\b.*\bin\b.*ms/;

/** Walk the report, carrying the nearest enclosing title down with us.
 *
 *  The first version of this looked for `stdout` and `title` on the SAME
 *  object and found nothing, on a run where the tests had printed plenty.
 *  Playwright's shape is suites > specs > tests > results, and `stdout` lives
 *  on a RESULT, which has no title of its own - the title is two or three
 *  levels up. Hence the inherited title rather than a same-object match. */
function collect(node, out, title) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(n => collect(n, out, title));
    return out;
  }

  const here = typeof node.title === 'string' && node.title ? node.title : title;

  // stdout chunks are [{ text }] or [{ buffer }]; a buffer is base64.
  if (Array.isArray(node.stdout)) {
    const text = node.stdout
      .map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c.text === 'string') return c.text;
        if (c && typeof c.buffer === 'string') {
          try { return Buffer.from(c.buffer, 'base64').toString('utf8'); } catch { return ''; }
        }
        return '';
      })
      .join('');
    const lines = text.split('\n').filter(l => INTERESTING.test(l));
    if (lines.length) out.push({ title: here || '(unnamed test)', lines });
  }

  Object.values(node).forEach(v => collect(v, out, here));
  return out;
}

if (!fs.existsSync(REPORT)) {
  console.log(`No ${REPORT} — the browser suite did not run, so there is nothing to report.`);
  process.exit(0);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
} catch (err) {
  console.log(`Could not read ${REPORT}: ${err.message}`);
  process.exit(0);
}

const found = collect(report, [], null);
if (!found.length) {
  console.log('The suite printed no measurements this run.');
  process.exit(0);
}

console.log('\nWhat the volume tests measured\n');
for (const { title, lines } of found) {
  console.log(`  ${title}`);
  lines.forEach(l => console.log(`  ${l.trimEnd()}`));
  console.log('');
}
