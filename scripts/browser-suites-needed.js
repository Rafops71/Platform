#!/usr/bin/env node
'use strict';
// Does this pull request change anything the long browser suites could notice?
//
// WHY (docs/ROADMAP-2026-11-22.md, section 0.6, step 2). The browser chain (Function checklist, Safari, the grid,
// the pictures) is about thirty of a pull request's thirty-four minutes. A pull request that changes ONLY documents
// cannot change what a browser sees or what a test asserts, so it need not pay for them. Everything else
// still does, in particular wording in js/i18n.js: a label change needs three browser assertions changed (#137), and
// only the browser suites see that.
//
// This applies to PULL REQUESTS only. A push to main (live) and a manual run always run everything, because that run
// is what gates publishing; the "changes" job in ci.yml says "true" for them without asking this script. The fast jobs
// (database tests, the volume tests, the offline checks) run on every pull request regardless.
//
// Reads changed file names on stdin (one per line) and prints "true" if the browser suites must run, "false" if
// not. With no input at all it prints "true" (when in doubt, run them).
//   --self-test   checks the rule itself

// Documents only: the docs folder (except the checklist, which `npm run checklist` reads as the list of functions
// that need a passing test), the mockups, and Markdown files in the repository root.
const DOCUMENT_ONLY = [
  /^docs\/(?!CHECKLIST\.md$)/,
  /^mockups\//,
  /^[^/]+\.md$/,
];

function browserSuitesNeeded(files) {
  if (!files.length) return true;
  return !files.every(f => DOCUMENT_ONLY.some(re => re.test(f)));
}

if (process.argv.includes('--self-test')) {
  const cases = [
    [['docs/PLAN-x.md'], false],
    [['docs/AGREED-2026-11-23-x.md', 'HANDOFF.md'], false],
    [['mockups/translate/index.html'], false],
    [['README.md', 'docs/a.md', 'docs/drafts/restore-backup.sh'], false],
    [['docs/CHECKLIST.md'], true],                 // the list of functions the checklist job must prove
    [['docs/a.md', 'js/i18n.js'], true],           // wording is NOT documents: the browser tests assert on it
    [['js/i18n.js'], true],
    [['sql/071_x.sql'], true],
    [['tests/e2e/a.spec.js'], true],
    [['.github/workflows/ci.yml'], true],
    [['terms/changes/3.8.md'], true],              // the Terms are served and checked
    [['css/styles.css', 'docs/a.md'], true],
    [['package.json'], true],
    [['notes/x.md'], true],                        // a Markdown file outside the root and docs/ is not assumed harmless
    [[], true],
  ];
  for (const [files, want] of cases) {
    if (browserSuitesNeeded(files) !== want) { console.error(`browser-suites self-test FAILED for ${JSON.stringify(files)}`); process.exit(1); }
  }
  console.log(`Browser-suites filter: ${cases.length} self-tests pass.`);
  process.exit(0);
}

let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  console.log(String(browserSuitesNeeded(input.split('\n').map(s => s.trim()).filter(Boolean))));
});
