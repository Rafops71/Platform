#!/usr/bin/env node
'use strict';
// Does this pull request change anything that can move a picture?
//
// WHY (docs/FABLE-ORCHESTRATION-2026-11-16.md, fix 4). The picture job fails on any
// text change to a public page at a tolerance of 0.1% of pixels, and each retake costs
// a run. A change that cannot move a pixel (wording in js/i18n.js, a migration, a test)
// should not pay for it. The nightly run in security-grid.yml is untouched and still
// catches drift.
//
// Reads changed file names on stdin (one per line) and prints "true" if the pictures
// must run, "false" if not. With no input at all (not a pull request) it prints "true".
//   --self-test   checks the rule itself

// Layout files: styles, every page's HTML, the picture tests and their config, the
// workflow itself, and the scripts that draw screens (js/ except wording and the demo's
// fake data). js/i18n.js alone changes words, not boxes, so it is the one exception.
const LAYOUT = [
  /^css\//,
  /^[^/]+\.html$/,
  /^www\//,
  /^tests\/visual\//,
  /^playwright\.visual\.config\.js$/,
  /^\.github\/workflows\/security-grid\.yml$/,
  /^js\/(?!i18n\.js$)(?!demo\/)/,
];

function pictureRunNeeded(files) {
  if (!files.length) return true;
  return files.some(f => LAYOUT.some(re => re.test(f)));
}

if (process.argv.includes('--self-test')) {
  const cases = [
    [['js/i18n.js'], false],
    [['js/i18n.js', 'sql/067_x.sql', 'tests/e2e/a.spec.js', 'docs/x.md'], false],
    [['css/styles.css'], true],
    [['app.html'], true],
    [['js/app.js'], true],
    [['js/i18n.js', 'js/operator.js'], true],
    [['tests/visual/pages.spec.js'], true],
    [['.github/workflows/security-grid.yml'], true],
    [['terms/changes/3.8.md'], false],
    [[], true],
  ];
  for (const [files, want] of cases) {
    if (pictureRunNeeded(files) !== want) { console.error(`layout self-test FAILED for ${JSON.stringify(files)}`); process.exit(1); }
  }
  console.log(`Picture-job filter: ${cases.length} self-tests pass.`);
  process.exit(0);
}

let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  console.log(String(pictureRunNeeded(input.split('\n').map(s => s.trim()).filter(Boolean))));
});
