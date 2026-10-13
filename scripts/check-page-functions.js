#!/usr/bin/env node
'use strict';

// Every function a page calls must exist on that page.
//
// WHY THIS EXISTS
//
// js/reset.js called initLanguage(). No such function has ever existed in
// this codebase - the pair every other page calls is applyTranslations() +
// renderLanguageToggle(). It threw a ReferenceError on load, before the
// recovery check ran, so the page sat on "Checking the link…" forever and a
// person with a bad link was never told. `node --check` passed it, because
// the file parses perfectly: a call to a function that does not exist is only
// an error when a browser reaches the line.
//
// It took two failed CI runs to find, with the symptom pointing at the status
// line and the cause three lines away in a different file. A whole class of
// bug, not one instance - so it gets a check rather than a fix.
//
// WHAT IT DOES
//
// For each HTML page, read the <script src="js/..."> tags in order, collect
// every name those files define, collect every name they call, and report any
// call that nothing on the page defines.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It is not a type checker and it is not a parser. It reads top-level
// declarations only, which is how this codebase is written, and it ignores
// method calls (`a.b()`) entirely because the receiver's shape is unknowable
// from text. It can therefore miss things. It cannot invent them: a name it
// reports is genuinely called and genuinely not defined anywhere the page
// loads.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Things the browser, or the Supabase UMD bundle, provides.
const PROVIDED = new Set([
  'alert', 'confirm', 'prompt', 'fetch', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'queueMicrotask',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number',
  'Boolean', 'Array', 'Object', 'Date', 'Error', 'Promise', 'Map', 'Set',
  'JSON', 'Math', 'RegExp', 'Symbol', 'BigInt', 'URL', 'URLSearchParams',
  'FormData', 'Blob', 'File', 'Intl', 'structuredClone', 'btoa', 'atob',
  'escape', 'unescape', 'eval', 'require', 'super', 'import', 'crypto',
  // control-flow keywords that look like calls in plain text
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await',
  'function', 'async', 'new', 'delete', 'void', 'in', 'of', 'do', 'else',
  'try', 'throw', 'yield', 'case', 'with', 'constructor',
]);

/** Strip comments and string/template literals so neither can contribute a
 *  false definition or a false call. */
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      // Single and double quotes are bounded to their own line. A regex
      // literal such as /['"]/ otherwise opens a string that swallows the
      // rest of the file, and every definition after it disappears - which
      // is precisely what happened on the first run of this checker: it
      // reported 36 missing functions, all of which exist.
      const quote = c;
      let j = i + 1;
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n' && quote !== '`') break;
        j++;
      }
      if (j < n && src[j] === quote) {
        i = j + 1;
        out += '""';
        continue;
      }
      // Unterminated on this line: not a string. Keep it as a plain char.
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function definitionsIn(src) {
  const names = new Set();
  let m;
  const decl = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  while ((m = decl.exec(src))) names.add(m[1]);
  // const f = ... / let f = ... / var f = ...  (any value: a function, an
  // object, a client - all of them are callable or dereferenced by name)
  const assigned = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = assigned.exec(src))) names.add(m[1]);
  // window.f = function ... — the explicit cross-file hook this codebase uses
  const onWindow = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = onWindow.exec(src))) names.add(m[1]);
  // Parameters, because a function taking a callback calls it by that name.
  const params = /function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g;
  while ((m = params.exec(src))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/[\s=]/)[0].replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // Arrow-function parameters, in both shapes: (a, b) => and  a =>
  const arrows = /(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  while ((m = arrows.exec(src))) {
    for (const part of (m[1] ?? m[2] ?? '').split(',')) {
      const name = part.trim().split(/[\s=]/)[0].replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

function callsIn(src) {
  const names = new Map(); // name -> first line number
  // A bare name followed by "(" and not preceded by "." or a word character.
  const call = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = call.exec(src))) {
    const name = m[2];
    if (PROVIDED.has(name)) continue;
    if (names.has(name)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    names.set(name, line);
  }
  return names;
}

function scriptsFor(htmlFile) {
  const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  const out = [];
  const tag = /<script[^>]*src="([^"]+)"/g;
  let m;
  while ((m = tag.exec(html))) {
    if (m[1].startsWith('js/')) out.push(m[1]);
  }
  return out;
}

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const problems = [];
let checked = 0;

for (const page of pages) {
  const scripts = scriptsFor(page);
  if (!scripts.length) continue;

  const defined = new Set();
  const sources = [];
  for (const s of scripts) {
    const src = strip(fs.readFileSync(path.join(ROOT, s), 'utf8'));
    sources.push([s, src]);
    for (const name of definitionsIn(src)) defined.add(name);
  }

  for (const [file, src] of sources) {
    // A call the file itself guards with `typeof name === 'function'` is a
    // deliberate optional dependency, not a mistake. utils.js does this for
    // t() and i18nLocale() because operator.html does not load i18n.js, and
    // falls back to the stored English. Honouring the guard is the point: a
    // checker that cannot tell a guarded call from a bare one gets switched
    // off, and then it catches nothing.
    const guarded = new Set();
    const guard = /typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*""/g;
    let g;
    while ((g = guard.exec(src))) guarded.add(g[1]);

    for (const [name, line] of callsIn(src)) {
      if (guarded.has(name)) continue;
      if (!defined.has(name)) {
        problems.push(`${file}:${line} — ${page} calls ${name}(), which nothing it loads defines`);
      }
    }
  }
  checked += scripts.length;
}

if (problems.length) {
  console.error('\nFAIL — a page calls something that does not exist:\n');
  for (const p of [...new Set(problems)].sort()) console.error('  • ' + p);
  console.error('\nThis is a ReferenceError at run time. `node --check` cannot see it.\n');
  process.exit(1);
}

console.log(`OK — ${pages.length} pages, ${checked} script references, every call resolves.`);
