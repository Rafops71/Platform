#!/usr/bin/env node
// Checks the one-time carry-over of a member's saved language from the old
// browser key (jericho.language, before the rename to MyPlatform) to the new
// key (myplatform.language). Runs the real code from js/i18n.js in a sandbox
// with a fake localStorage. No browser needed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
const start = src.indexOf("const I18N_STORAGE_KEY");
const end = src.indexOf('carryOverOldLanguage();', start) + 'carryOverOldLanguage();'.length;
if (start < 0 || end < start) { console.error('carry-over code not found in js/i18n.js'); process.exit(1); }
const block = src.slice(start, end);

function run(initial, { throws = false } = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = throws
    ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  vm.runInNewContext(block, { localStorage });
  return Object.fromEntries(store);
}

const cases = [
  ['old es, new empty: copied to new key', run({ 'jericho.language': 'es' }),
    (s) => s['myplatform.language'] === 'es' && s['jericho.language'] === 'es'],
  ['old en, new empty: copied to new key', run({ 'jericho.language': 'en' }),
    (s) => s['myplatform.language'] === 'en'],
  ['new key already set: old key ignored', run({ 'jericho.language': 'es', 'myplatform.language': 'en' }),
    (s) => s['myplatform.language'] === 'en'],
  ['unsupported old value: nothing copied', run({ 'jericho.language': 'fr' }),
    (s) => !('myplatform.language' in s)],
  ['no old key: nothing written', run({}),
    (s) => !('myplatform.language' in s)],
  ['storage throws: no exception', (() => { try { run({}, { throws: true }); return {}; } catch (e) { return { threw: e.message }; } })(),
    (s) => !('threw' in s)],
];

let failed = 0;
for (const [name, result, ok] of cases) {
  const pass = ok(result);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
}
if (failed) { console.error(`${failed} language carry-over check(s) FAILED`); process.exit(1); }
console.log(`OK — ${cases.length} language carry-over checks pass.`);
