#!/usr/bin/env node
'use strict';
// A test must not assert content on an element the page hides.
//
// WHY (docs/FABLE-ORCHESTRATION-2026-11-16.md, fix 6; cause C). A browser test was
// written against an element that is hidden when the page loads, so it could never
// pass, and it was pushed anyway. This finds that mistake when the test is written,
// in a second, instead of after a browser run on CI.
//
// THE RULE. A positive content assertion (toHaveText, toContainText, toHaveValue,
// toBeChecked) on an element selected by #id fails this check when
//   1. the page's own HTML hides that element when it loads (it, or an ancestor, has
//      class "hidden", a hidden attribute or display:none), AND
//   2. none of the 12 lines before the assertion shows something first: a click, check,
//      selectOption, fill, goto, press, or a toBeVisible() / toBeHidden() assertion.
// A line may state the reason itself with the comment   // shown-by: <what reveals it>
//
// What this cannot see: an element revealed by script after load, with the reveal further
// than 12 lines away. Those need the comment; the comment is the point - it makes the writer
// say how the element becomes visible. It is a lint, not a judge: the checklist is.
//
//   node scripts/check-test-hidden.js            the whole tests/e2e folder
//   node scripts/check-test-hidden.js --self-test

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['app.html', 'operator.html', 'register.html', 'index.html', 'reset.html', 'terms.html'];
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'col', 'area', 'base', 'wbr']);
const ASSERT = /expect\(\s*(?:page\.)?locator\(\s*['"`]#([\w-]+)[^'"`]*['"`]\s*\)[^)]*\)\.(toHaveText|toContainText|toHaveValue|toBeChecked)\(/;
const REVEAL = /\.(click|check|selectOption|fill|goto|press|dispatchEvent)\(|toBeVisible\(|toBeHidden\(|openScreen\(|signIn\(|submitListing\(|firstSignIn\(/;

/** Ids the page's own HTML hides when it loads. */
function staticallyHiddenIds(htmlTexts) {
  const hidden = new Set();
  for (const s of htmlTexts) {
    const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
    const stack = [];
    let m;
    while ((m = re.exec(s))) {
      const [, close, tag, attrs] = m;
      if (close) { stack.pop(); continue; }
      const self = /class="[^"]*\bhidden\b/.test(attrs) || /\shidden(?=[\s>=]|$)/.test(attrs) || /display:\s*none/.test(attrs);
      const h = !!(self || (stack.length && stack[stack.length - 1]));
      const id = /\sid="([^"]+)"/.exec(attrs);
      if (id && h) hidden.add(id[1]);
      if (!VOID.has(tag.toLowerCase()) && !/\/\s*$/.test(attrs)) stack.push(h);
    }
  }
  return hidden;
}

function findProblems(file, text, hidden) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = ASSERT.exec(line);
    if (!m || !hidden.has(m[1])) return;
    if (/\/\/\s*shown-by:/.test(line) || (i > 0 && /\/\/\s*shown-by:/.test(lines[i - 1]))) return;
    const before = lines.slice(Math.max(0, i - 12), i).join('\n');
    if (REVEAL.test(before)) return;
    out.push(`${file}:${i + 1}  #${m[1]} is hidden when the page loads, and nothing shown it in the 12 lines before this assertion`);
  });
  return out;
}

if (process.argv.includes('--self-test')) {
  const hidden = staticallyHiddenIds(['<div class="hidden"><span id="inner"></span></div><p id="shown"></p><div id="d" style="display:none"></div><input id="i" hidden><div id="after"></div>']);
  const want = ['inner', 'd', 'i'];
  if (want.some(w => !hidden.has(w)) || hidden.has('shown') || hidden.has('after')) { console.error('self-test FAILED: hidden ids wrong: ' + [...hidden]); process.exit(1); }
  const bad = "await expect(page.locator('#inner')).toHaveText('x');";
  const okClick = "await page.click('#go');\nawait expect(page.locator('#inner')).toHaveText('x');";
  const okVisible = "await expect(page.locator('#box')).toBeVisible();\nawait expect(page.locator('#inner')).toContainText('x');";
  const okComment = "// shown-by: the sign-in script opens it\nawait expect(page.locator('#inner')).toHaveText('x');";
  const far = Array(15).fill('const a = 1;').join('\n');
  const tooFar = "await page.click('#go');\n" + far + "\nawait expect(page.locator('#inner')).toHaveText('x');";
  const shown = "await expect(page.locator('#shown')).toHaveText('x');";
  const cases = [[bad, 1], [okClick, 0], [okVisible, 0], [okComment, 0], [tooFar, 1], [shown, 0]];
  for (const [t, n] of cases) {
    if (findProblems('t.js', t, hidden).length !== n) { console.error('self-test FAILED on:\n' + t); process.exit(1); }
  }
  console.log(`Hidden-element lint: ${cases.length} self-tests pass.`);
  process.exit(0);
}

const hidden = staticallyHiddenIds(PAGES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')));
const dir = path.join(ROOT, 'tests', 'e2e');
const problems = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
  problems.push(...findProblems(`tests/e2e/${f}`, fs.readFileSync(path.join(dir, f), 'utf8'), hidden));
}
if (problems.length) {
  console.error('\nHidden-element lint FAILED\n');
  problems.forEach(p => console.error('  • ' + p));
  console.error('\nShow the element first (click, select, toBeVisible on its container), or say how it is shown with   // shown-by: <reason>\n');
  process.exit(1);
}
console.log(`Hidden-element lint: ${hidden.size} elements the pages hide at load, none asserted on blindly. OK.`);
