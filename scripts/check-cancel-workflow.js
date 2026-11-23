#!/usr/bin/env node
'use strict';
// Keeps .github/workflows/cancel-superseded.yml unable to cancel anything but a superseded pull-request run.
// It cancels runs, so it must not be able to cancel the push-to-main run that publishes the site. The decision lives in
// scripts/superseded-runs.js (self-tested); this checks the workflow can only ever act on that script's answer.
//   node scripts/check-cancel-workflow.js            (npm run prepush runs it, and its self-test)
//   node scripts/check-cancel-workflow.js --self-test

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', '.github', 'workflows', 'cancel-superseded.yml');

function problemsIn(text) {
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const p = [];
  const on = /^on:\s*\n((?:\s+.*\n?)*)/m.exec(code);
  const onBlock = on ? on[1] : '';
  if (!/^\s+pull_request:/m.test(onBlock)) p.push('the workflow must be triggered by pull_request');
  if (/^\s+(push|workflow_dispatch|schedule|workflow_run|pull_request_target):/m.test(onBlock)) p.push('the workflow must be triggered by pull_request ONLY (no push, manual, scheduled, workflow_run or pull_request_target trigger)');
  const cancels = code.split('\n').filter((l) => /\bgh\s+run\s+cancel\b/.test(l));
  if (cancels.length !== 1) p.push(`exactly one "gh run cancel" is allowed (found ${cancels.length})`);
  if (!/node scripts\/superseded-runs\.js < runs\.json > older\.txt/.test(code)) p.push('the run ids to cancel must come from scripts/superseded-runs.js');
  if (!/done < older\.txt/.test(code) || !/gh run cancel --repo "\$REPO" "\$id"/.test(code)) p.push('"gh run cancel" must take its id from the loop over older.txt only');
  if (/gh run cancel[^\n]*(--all|main|\$\{?\{?\s*github\.sha)/.test(code)) p.push('gh run cancel must not name main, --all or the current sha');
  if (!/--workflow ci\.yml/.test(code)) p.push('only the CI workflow\'s runs may be listed (--workflow ci.yml)');
  if (!/BRANCH:\s*\$\{\{\s*github\.event\.pull_request\.head\.ref\s*\}\}/.test(code) || !/HEAD_SHA:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/.test(code)) p.push('BRANCH and HEAD_SHA must be the pull request\'s head branch and commit');
  return p;
}

if (process.argv.includes('--self-test')) {
  const good = fs.readFileSync(FILE, 'utf8');
  const breaks = {
    'a push trigger is added': good.replace('on:\n  pull_request:', 'on:\n  push:\n    branches: [main]\n  pull_request:'),
    'a manual trigger is added': good.replace('on:\n  pull_request:', 'on:\n  workflow_dispatch: {}\n  pull_request:'),
    'pull_request_target is used': good.replace('on:\n  pull_request:', 'on:\n  pull_request_target:'),
    'a second cancel is added': good.replace('echo "Cancelled $cancelled', 'gh run cancel --repo "$REPO" 1\n          echo "Cancelled $cancelled'),
    'the run ids no longer come from the script': good.replace('node scripts/superseded-runs.js < runs.json > older.txt', 'cp runs.json older.txt'),
    'it lists another workflow': good.replace('--workflow ci.yml', '--workflow deploy.yml'),
    'the branch is not the pull request\'s': good.replace('${{ github.event.pull_request.head.ref }}', 'main'),
  };
  let failed = 0;
  console.log((problemsIn(good).length === 0 ? 'PASS' : 'FAIL') + '  the real workflow is clean');
  if (problemsIn(good).length) failed++;
  for (const [what, text] of Object.entries(breaks)) {
    const changed = text !== good;
    const caught = problemsIn(text).length > 0;
    console.log(`${changed && caught ? 'PASS' : 'FAIL'}  ${what} is caught${changed ? '' : ' (the break did not change the file)'}`);
    if (!(changed && caught)) failed++;
  }
  process.exit(failed ? 1 : 0);
}

const problems = problemsIn(fs.readFileSync(FILE, 'utf8'));
if (problems.length) { console.error('cancel-superseded.yml has problems:\n' + problems.map((x) => '  - ' + x).join('\n')); process.exit(1); }
console.log('cancel-superseded.yml: triggered by pull_request only; one gh run cancel, fed only by scripts/superseded-runs.js.');
