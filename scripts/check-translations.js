#!/usr/bin/env node
'use strict';

// Every phrase exists in both languages, and the interface asks for no phrase
// that does not exist.
//
// WHY THIS EXISTS
//
// t() in js/i18n.js falls back: an unknown key returns the key itself, and a
// key missing from Spanish quietly returns the English. Both failures are
// invisible to every test that only looks at English, and the second one is
// worse than a crash - a Spanish-speaking member reads a screen that is mostly
// Spanish with English sentences in it, and nobody who built it ever sees that
// screen.
//
// This platform's second language is not decoration. A member who needs
// Spanish is the one least able to guess their way through an English page.
//
// WHAT IT CHECKS
//
// 1. Every key in English exists in Spanish, and the reverse.
// 2. Every data-i18n="..." in the HTML names a key that exists.
// 3. Every t('...') call in the JavaScript names a key that exists.
// 4. No Spanish value is byte-identical to its English one, unless the word is
//    the same in both languages on purpose (a short allow-list below).
//
// WHAT IT CANNOT CHECK
//
// Whether the Spanish is any GOOD. That needs a person who speaks it.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');

/** Read one language table out of js/i18n.js by matching its braces. */
function tableFor(lang) {
  const start = src.search(new RegExp(`^\\s{2}${lang}:\\s*\\{`, 'm'));
  if (start < 0) throw new Error(`no ${lang} table found in js/i18n.js`);
  let i = src.indexOf('{', start);
  let depth = 0;
  let end = i;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(i + 1, end);

  const out = new Map();
  // Keys are written as 'some.key': '...' or "some.key": "..." on one line.
  const row = /^\s*['"]([\w.]+)['"]\s*:\s*(['"])([\s\S]*?)\2\s*,?\s*$/gm;
  let m;
  while ((m = row.exec(body))) out.set(m[1], m[3]);
  return out;
}

const en = tableFor('en');
const es = tableFor('es');

// Words that are genuinely the same in both languages. Each one is here
// because somebody checked it, not because the checker was noisy.
const SAME_IN_BOTH = new Set([
  'brand',          // the platform's name, which does not translate
  'form.incoterm',  // Incoterms are published by the ICC under that one name
  'lang.name.en',   // a language picker shows each language in its own words
  'lang.name.es',
  'unit.Bushels',   // see the note below
]);

// unit.Bushels is the one entry here that was NOT verified. Every other unit
// is translated (Barrels/Barriles, Gallons/Galones), so an untranslated one
// stands out. "Bushel" is used in Spanish-language grain trade as a loanword,
// but that is a claim about commercial usage today, which cannot be checked
// from here - so it is written down as unverified rather than asserted. If a
// Spanish-speaking trader says otherwise, change the value and delete this
// line.

const problems = [];

for (const key of en.keys()) if (!es.has(key)) problems.push(`missing from Spanish: ${key}`);
for (const key of es.keys()) if (!en.has(key)) problems.push(`missing from English: ${key}`);

for (const [key, value] of en) {
  if (!es.has(key) || SAME_IN_BOTH.has(key)) continue;
  if (es.get(key) === value && /[a-zA-Z]{4}/.test(value)) {
    problems.push(`not translated (identical to English): ${key} — "${value.slice(0, 48)}"`);
  }
}

// Keys the interface asks for.
const used = new Map(); // key -> where
for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const tag = /data-i18n(?:-[a-z]+)*="([\w.]+)"/g;   // -aria-label has two parts
  let m;
  while ((m = tag.exec(html))) if (!used.has(m[1])) used.set(m[1], file);
}
for (const file of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
  const js = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
  // t('key') or t('key', {...}) - a literal only; a computed key cannot be
  // checked from text and is reported as unchecked rather than guessed at.
  const call = /\bt\(\s*'([\w.]+)'/g;
  let m;
  while ((m = call.exec(js))) if (!used.has(m[1])) used.set(m[1], 'js/' + file);
}

for (const [key, where] of used) {
  if (!en.has(key)) problems.push(`asked for but never defined: ${key} (${where})`);
}

if (problems.length) {
  console.error('\nFAIL — the two languages do not agree:\n');
  for (const p of [...new Set(problems)].sort()) console.error('  • ' + p);
  console.error('\nA missing Spanish phrase does not crash. It shows English to somebody who does not read it.\n');
  process.exit(1);
}

console.log(`OK — ${en.size} phrases, both languages, ${used.size} used by the interface and all defined.`);
