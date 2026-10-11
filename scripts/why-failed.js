// Print why the browser tests failed, from the report the last run already saved.
//
// `npx playwright test --reporter=line` prints this too, but buried in hundreds
// of lines of retries and stack frames. The checklist report writes the full
// reporter JSON to checklist-results.json, which has the same errors in a form
// worth reading: one test, one reason.
//
//   npm run why
//
// Reads the file only. Runs nothing, needs no credentials, changes nothing.

'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'checklist-results.json');
if (!fs.existsSync(file)) {
  console.error('No checklist-results.json — run `npm run checklist` first.');
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const failures = [];

const walk = (suite) => {
  for (const spec of suite.specs || []) {
    if (spec.ok) continue;
    const results = (spec.tests || []).flatMap((t) => t.results || []);
    if (results.length && results.every((r) => r.status === 'skipped')) continue;
    const err = results.map((r) => r.error).find(Boolean) || {};
    failures.push({
      file: (suite.file || suite.title || '').split(/[\\/]/).pop(),
      line: spec.line,
      title: spec.title,
      // The first line of the message is the assertion; the rest is usually a
      // diff or a locator dump that repeats it at length.
      why: String(err.message || '(no message recorded)')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(' | '),
    });
  }
  for (const child of suite.suites || []) walk(child);
};
for (const suite of report.suites || []) walk(suite);

if (!failures.length) {
  console.log('No failures in the saved report.');
  process.exit(0);
}

console.log(`${failures.length} failing test(s):\n`);
for (const f of failures) {
  console.log(`${f.file}:${f.line}`);
  console.log(`  ${f.title}`);
  console.log(`  -> ${f.why.slice(0, 300)}\n`);
}
