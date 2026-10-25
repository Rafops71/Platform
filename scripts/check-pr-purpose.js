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
const known = new Set([...checklist.matchAll(/^\|\s*(\d{2})\s*\|/gm)].map((m) => m[1]));

const items = [...body.matchAll(/\bItems?\s?(\d{2})\b/gi)].map((m) => m[1]);
const unknown = items.filter((n) => !known.has(n));
const decisions = /docs\/AGREED-[\w.-]+\.md/.test(body);

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
