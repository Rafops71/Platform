#!/usr/bin/env node
'use strict';

// Anything that CREATES a row must not be startable twice.
//
// WHY THIS EXISTS
//
// Seven actions inserted rows without switching their button off first: the
// enquiry to the Operator, the Operator's forward, the Operator's reply, an
// invitation, a document request, a saved search, a new commodity. On a phone
// - which is where this platform is used - a double tap is not a mistake
// anybody notices making, and two of those duplicates are visible to a member:
// a forward arriving twice from an Operator who sent it once, and an
// invitation emailing somebody twice before the platform has said a word to
// them.
//
// Found by audit on 2026-10-13, not by a failing test, because nothing was
// broken enough to fail - it just did the thing twice.
//
// HOW A FUNCTION PASSES
//
// Either it disables its control itself, or it is the inner half of a
// withButtonBusy(...) pair (see js/utils.js), which does it for them.
//
// DELIBERATE EXEMPTIONS
//
// Functions in EXEMPT below are not triggered by a person pressing anything.
// Each is listed with its reason; adding to the list is a decision, not a way
// to quieten the check.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/app.js', 'js/operator.js'];

const EXEMPT = new Map([
  // Writes an audit row as a side effect of an action already guarded by
  // whichever handler called it. It has no control of its own to disable.
  ['logOpActivity', 'internal audit write, not a control'],
]);

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const problems = [];
let checked = 0;

for (const file of FILES) {
  const src = strip(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const lines = src.split('\n');

  // Names handed to withButtonBusy as the work to run: these are guarded by
  // their wrapper rather than by their own body.
  const wrapped = new Set();
  for (const m of src.matchAll(/withButtonBusy\([^,]+,[^,]+,\s*(\w+)\s*\)/g)) wrapped.add(m[1]);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:async )?function (\w+)\s*\([^)]*\)\s*\{/);
    if (!m) continue;

    let depth = 0;
    const body = [];
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      body.push(lines[j]);
      if (depth === 0 && j > i) break;
    }
    const text = body.join('\n');

    // Only creators. An update run twice lands in the same place; an insert
    // run twice does not.
    if (!/\.insert\(/.test(text) && !/\.rpc\('send_manual_reminder'/.test(text)) continue;

    checked++;
    const name = m[1];
    if (EXEMPT.has(name)) continue;
    if (wrapped.has(name)) continue;
    if (/withButtonBusy\(/.test(text)) continue;
    if (/disabled\s*=\s*true/.test(text)) continue;

    problems.push(`${file}:${i + 1} — ${name}() creates a row with nothing stopping a second press`);
  }
}

// Inline handlers that insert without any guard at all.
for (const file of FILES) {
  const src = strip(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  for (const m of src.matchAll(/addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{([\s\S]{0,600}?)\}\)\)/g)) {
    if (!/\.insert\(/.test(m[1])) continue;
    checked++;
    if (/disabled\s*=\s*true|withButtonBusy\(/.test(m[1])) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push(`${file}:${line} — a click handler inserts a row with no guard`);
  }
}

if (problems.length) {
  console.error('\nFAIL — a double press would create two of something:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('\nWrap it with withButtonBusy() in js/utils.js, or disable the control yourself.\n');
  process.exit(1);
}

console.log(`OK — ${checked} row-creating actions, every one guarded against a second press.`);
