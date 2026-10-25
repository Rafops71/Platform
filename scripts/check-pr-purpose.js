#!/usr/bin/env node
'use strict';
// Every pull request names what it serves - a checklist item or a decision.
//
// WHY. The owner's complaint was drift: work that is busy without serving
// anything he asked for. docs/CHECKLIST.md lists the functions and
// docs/AGREED-*.md the decisions; this makes each pull request point at one
// of them in its description, or the build fails. It is the fifth step of the
// supervision plan (docs/SUPERVISION-ASSESSMENT.md), checked by a script
// rather than by anybody's judgement.
//
// What counts: "Item NN" / "ItemNN" for a checklist item that exists, or a
// link to a decisions file (docs/AGREED-...). Read from PR_BODY.

const fs = require('fs');
const path = require('path');

const body = process.env.PR_BODY || '';
const checklist = fs.readFileSync(path.join(__dirname, '..', 'docs', 'CHECKLIST.md'), 'utf8');
const known = new Set([...checklist.matchAll(/^\|\s*(\d{2,3})\s*\|/gm)].map((m) => m[1]));

const items = [...body.matchAll(/\bItems?\s?(\d{1,3})\b/gi)].map((m) => m[1].padStart(2, '0'));
const unknown = items.filter((n) => !known.has(n));
// The decisions file has to exist, not merely be named (raised by the
// second-opinion reviewer on PR #20: "docs/AGREED-FAKE.md" would have passed).
const decisions = [...body.matchAll(/docs\/AGREED-[\w.-]+\.md/g)]
  .some((m) => fs.existsSync(path.join(__dirname, '..', m[0])));

if (unknown.length) {
  console.error(`FAIL - the description names checklist item(s) that do not exist: ${[...new Set(unknown)].join(', ')}`);
  process.exit(1);
}
if (!items.length && !decisions) {
  console.error('FAIL - this pull request does not say what it serves.');
  console.error('  Name a checklist item ("Item 70") or the decision it carries out');
  console.error('  ("docs/AGREED-2026-10-25.md") in the description.');
  process.exit(1);
}
console.log(`OK - serves ${items.length ? 'Item(s) ' + [...new Set(items)].join(', ') : ''}${items.length && decisions ? ' and ' : ''}${decisions ? 'a recorded decision' : ''}.`);
