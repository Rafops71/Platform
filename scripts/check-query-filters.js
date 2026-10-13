#!/usr/bin/env node
'use strict';

// No typed text is spliced raw into a PostgREST filter string.
//
// WHY THIS EXISTS
//
// The Operator's region box was built straight into a filter:
//
//   query.or(`origin.ilike.%${region}%,destination.ilike.%${region}%`)
//
// A comma typed in that box is punctuation, not text. Proven against the live
// API on 2026-10-13: `zzzz,role.eq.operator` returned the operator rows, which
// means the typed text had become an extra condition on the query.
//
// Nothing escaped through it, because these queries run under Row Level
// Security and an Operator may already read what that one reaches. The pattern
// is the problem: the same two lines on a member's screen would hand a member
// a way to rewrite their own query, and the whole product is that members
// cannot see each other. pgLikeValue() in js/utils.js quotes the value, which
// the live API confirmed turns it back into text.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];
let checked = 0;

for (const file of ['js/app.js', 'js/operator.js', 'js/auth.js', 'js/reset.js']) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // Values that were quoted once and held in a local, which is how the one
  // real call site reads: `const v = pgLikeValue(region)`.
  const safeLocals = new Set();
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*pgLikeValue\(/g)) safeLocals.add(m[1]);

  // .or(`...`) / .filter(`...`) / .ilike(..., `...`) with a template literal
  for (const m of src.matchAll(/\.(or|filter|ilike|like|not)\(\s*`([^`]*)`/g)) {
    checked++;
    const inside = m[2];
    if (!inside.includes('${')) continue;

    // Every interpolation in the filter must be a quoted value.
    for (const slot of inside.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = slot[1].trim();
      const quoted = /pgLikeValue/.test(expr) || safeLocals.has(expr) ||
        /^'[^']*'$/.test(expr) ||
        // a value already wrapped in double quotes in the template
        new RegExp('"[^"]*\\$\\{' + expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}').test(inside);
      if (!quoted) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push(`${file}:${line} — ${expr} goes into a filter unquoted; a comma in it becomes another condition`);
      }
    }
  }
}

if (problems.length) {
  console.error('\nFAIL — typed text is being read as query syntax:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('\nWrap the value with pgLikeValue() from js/utils.js.\n');
  process.exit(1);
}

console.log(`OK — ${checked} filter expressions, none splices typed text into query syntax.`);
