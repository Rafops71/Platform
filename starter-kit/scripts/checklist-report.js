#!/usr/bin/env node
'use strict';

// Does every function in docs/CHECKLIST.md have a test that PASSED?
//
// WHAT THIS IS FOR
//
// A test suite tells you which tests passed. It cannot tell you that a
// function nobody wrote a test for is untested - that function is simply
// absent, and absence looks exactly like success. This closes that gap: the
// checklist is written by hand in plain words, and this refuses to go green
// unless every line of it has a passing test behind it.
//
// It fails three ways, and the third matters most:
//   - an item in the checklist with no test at all
//   - an item whose test failed
//   - a test claiming an ItemNN the checklist does not list (a test that has
//     drifted, or a typo that would otherwise silently cover nothing)
//
// TEST-RUNNER AGNOSTIC
//
// It runs whatever command you give it and reads ItemNN out of the output,
// so it works with jest, vitest, pytest, go test, playwright - anything that
// prints test names. It does not care about the format.
//
// USAGE
//   node scripts/checklist-report.js --run "npm test"
//   node scripts/checklist-report.js --run "pytest -v" --checklist docs/CHECKLIST.md

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// Not /\bItem(\d+)\b/: a test called Item01_signin has an underscore after
// the digits, and \b does not fire between "1" and "_" because both are word
// characters. That regex matched the checklist table and NOTHING in the test
// output, so every item read as "no test at all" - the gate failed closed,
// which is the safe direction, but it would have failed closed forever.
// Caught by testing the gate itself against output it was supposed to accept.
const ITEM = /\bItem(\d{1,3})(?!\d)/g;

/** Every ItemNN the checklist claims, in the order it claims them. */
function itemsInChecklist(file) {
  const text = fs.readFileSync(file, 'utf8');
  const items = new Map();
  for (const line of text.split('\n')) {
    // Only table rows and list items, so prose mentioning Item07 does not
    // invent a requirement.
    if (!/^\s*[|\-*]/.test(line)) continue;
    const found = line.match(ITEM);
    if (!found) continue;
    const id = found[0];
    if (!items.has(id)) {
      // The sentence, with the table pipes and the ItemNN taken out.
      const words = line.replace(/^\s*[|\-*]\s*/, '').split('|')[1] || line;
      items.set(id, words.replace(ITEM, '').replace(/[|`<>]/g, '').trim());
    }
  }
  return items;
}

/** What the test run said about each ItemNN: did a line mentioning it look
 *  like a failure? Deliberately pessimistic - a test whose result cannot be
 *  read is NOT a pass. */
function resultsFromOutput(output) {
  const results = new Map();
  const FAILED = /\b(fail(ed|ure)?|error|✗|✘|×|not ok|FAILED|ERROR)\b/i;
  const PASSED = /\b(pass(ed)?|ok|✓|✔|PASS|SUCCESS)\b/i;
  for (const line of output.split('\n')) {
    const found = line.match(ITEM);
    if (!found) continue;
    for (const id of found) {
      const verdict = FAILED.test(line) ? 'failed'
                    : PASSED.test(line) ? 'passed'
                    : 'unreadable';
      // A failure anywhere wins: a retried test that failed once is not clean.
      if (results.get(id) === 'failed') continue;
      if (verdict === 'failed' || !results.has(id)) results.set(id, verdict);
    }
  }
  return results;
}

function main() {
  const checklistPath = arg('checklist', path.join('docs', 'CHECKLIST.md'));
  const command = arg('run', null);

  if (!fs.existsSync(checklistPath)) {
    console.error(`No checklist at ${checklistPath}. Point at it with --checklist.`);
    process.exit(1);
  }
  if (!command) {
    console.error('Give the test command: --run "npm test"');
    process.exit(1);
  }

  const items = itemsInChecklist(checklistPath);
  if (!items.size) {
    console.error(`${checklistPath} lists no ItemNN at all. Nothing can be proven.`);
    process.exit(1);
  }

  console.log(`${items.size} functions in ${checklistPath}`);
  console.log(`Running: ${command}\n`);

  const run = spawnSync(command, { shell: true, encoding: 'utf8' });
  const output = `${run.stdout || ''}\n${run.stderr || ''}`;
  if (run.error) {
    console.error(`The test command could not be run at all: ${run.error.message}`);
    process.exit(1);
  }

  const results = resultsFromOutput(output);

  const missing = [];
  const failed = [];
  const unreadable = [];

  for (const [id, words] of items) {
    const verdict = results.get(id);
    const mark = verdict === 'passed' ? '✓' : verdict === 'failed' ? '✗' : '·';
    console.log(`  ${mark} ${id}  ${words}`);
    if (!verdict) missing.push(id);
    else if (verdict === 'failed') failed.push(id);
    else if (verdict === 'unreadable') unreadable.push(id);
  }

  // A test claiming an item the checklist does not list. Usually a typo, and
  // a typo here means a function everybody believes is covered and is not.
  const stray = [...results.keys()].filter(id => !items.has(id));

  console.log('');
  let bad = false;
  if (failed.length) { console.error(`FAILED: ${failed.join(', ')}`); bad = true; }
  if (missing.length) {
    console.error(`NO TEST AT ALL: ${missing.join(', ')} - these functions are unproven.`);
    bad = true;
  }
  if (unreadable.length) {
    console.error(`COULD NOT TELL: ${unreadable.join(', ')} - the output mentions them ` +
                  `but says neither pass nor fail. Treated as unproven.`);
    bad = true;
  }
  if (stray.length) {
    console.error(`CLAIMED BUT NOT LISTED: ${stray.join(', ')} - a test claims these, ` +
                  `${checklistPath} does not. Fix the typo or add the item.`);
    bad = true;
  }
  if (run.status !== 0 && !bad) {
    console.error(`The test command exited ${run.status}, so something failed that ` +
                  `carries no ItemNN. The checklist cannot see it; look at the output.`);
    bad = true;
  }

  if (bad) process.exit(1);
  console.log(`All ${items.size} functions proven by a passing test.`);
}

main();
