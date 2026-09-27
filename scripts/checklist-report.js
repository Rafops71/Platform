// Turns test results into a tick/cross table, one line per function, and fails
// if any function on the checklist has no passing test.
//
// docs/CHECKLIST.md is the source of truth for what the platform is supposed to
// do. This script reads it, runs the `@checklist` group, and matches the two up
// by the ItemNN prefix in each test title. The exit code is the point: it is 0
// only when every listed function has at least one passing test and no failing
// one. CI gates the build on it.
//
//   npm run checklist            # run the group and report
//   npm run checklist -- --dry   # report from the last run, do not re-run
//
// Three ways to fail, all deliberate:
//   - an item with no test at all        (a function nobody checks)
//   - an item whose test failed          (a function that is broken)
//   - a test whose ItemNN is not listed  (a test checking something untracked)
//
// The third matters because it catches the checklist and the suite drifting
// apart, which is how a list like this quietly stops meaning anything.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHECKLIST = path.join(ROOT, 'docs', 'CHECKLIST.md');
const RESULTS = path.join(ROOT, 'checklist-results.json');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m';
const DIM = '\x1b[2m', BOLD = '\x1b[1m', OFF = '\x1b[0m';

function readChecklist() {
  if (!fs.existsSync(CHECKLIST)) {
    console.error(`No checklist at ${CHECKLIST}`);
    process.exit(2);
  }
  const items = new Map();
  for (const line of fs.readFileSync(CHECKLIST, 'utf8').split('\n')) {
    // | 07 | Registration is refused unless the Terms are accepted | MUST NOT |
    const m = line.match(/^\|\s*(\d{2})\s*\|\s*(.+?)\s*\|\s*(does|MUST NOT)\s*\|/);
    if (m) items.set(m[1], { text: m[2], kind: m[3] });
  }
  if (!items.size) {
    console.error('Checklist has no items — expected rows like "| 01 | ... | does |".');
    process.exit(2);
  }
  return items;
}

function runSuite() {
  console.log(`${DIM}Running the @checklist group …${OFF}\n`);
  const res = spawnSync(
    'npx',
    ['playwright', 'test', '--grep', '@checklist', '--reporter', 'json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
  );
  // Playwright exits non-zero when tests fail. That is expected here: a failure
  // is a cross on the table, not a reason to abandon the report.
  if (!res.stdout) {
    console.error('Playwright produced no output.');
    if (res.stderr) console.error(res.stderr.slice(0, 4000));
    process.exit(2);
  }
  fs.writeFileSync(RESULTS, res.stdout);
  return res.stdout;
}

function collect(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error('Could not parse the Playwright JSON report.');
    process.exit(2);
  }
  const found = new Map(); // ItemNN -> { pass, fail, skip, titles }
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      const m = String(spec.title).match(/^Item(\d{2})_(\S+)/);
      if (!m) continue;
      const key = m[1];
      const row = found.get(key) || { pass: 0, fail: 0, skip: 0, titles: [] };
      row.titles.push(m[2]);
      // A spec can hold retries; ok is Playwright's own verdict on the spec.
      const results = (spec.tests || []).flatMap((t) => t.results || []);
      const statuses = results.map((r) => r.status);
      if (statuses.length && statuses.every((s) => s === 'skipped')) row.skip++;
      else if (spec.ok) row.pass++;
      else row.fail++;
      found.set(key, row);
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of report.suites || []) walk(suite);
  return found;
}

function main() {
  const dry = process.argv.includes('--dry');
  const items = readChecklist();

  let raw;
  if (dry) {
    if (!fs.existsSync(RESULTS)) {
      console.error(`--dry needs a previous run; ${path.basename(RESULTS)} is not there.`);
      process.exit(2);
    }
    raw = fs.readFileSync(RESULTS, 'utf8');
  } else {
    raw = runSuite();
  }

  const found = collect(raw);
  const crosses = [];
  const width = Math.max(...[...items.values()].map((i) => i.text.length));

  console.log(`${BOLD}Function checklist${OFF}\n`);
  for (const [num, item] of items) {
    const row = found.get(num);
    let mark, note = '';
    if (!row) {
      mark = `${RED}✗${OFF}`;
      note = `${RED}no test${OFF}`;
      crosses.push(`${num} — no test for "${item.text}"`);
    } else if (row.fail) {
      mark = `${RED}✗${OFF}`;
      note = `${RED}${row.fail} failing${OFF}`;
      crosses.push(`${num} — ${row.fail} failing test(s): ${item.text}`);
    } else if (!row.pass) {
      mark = `${YELLOW}−${OFF}`;
      note = `${YELLOW}skipped / blocked${OFF}`;
      crosses.push(`${num} — every test skipped: ${item.text}`);
    } else {
      mark = `${GREEN}✓${OFF}`;
      note = `${DIM}${row.pass} passing${OFF}`;
    }
    const prohibition = item.kind === 'MUST NOT' ? `${DIM} [must not]${OFF}` : '';
    console.log(` ${mark} ${num}  ${item.text.padEnd(width)}  ${note}${prohibition}`);
  }

  // A test claiming an item the checklist does not list.
  const orphans = [...found.keys()].filter((k) => !items.has(k)).sort();
  if (orphans.length) {
    console.log(`\n${RED}Tests for items that are not on the checklist:${OFF}`);
    for (const o of orphans) console.log(`  Item${o} — ${found.get(o).titles.join(', ')}`);
    crosses.push(`tests reference unlisted item(s): ${orphans.join(', ')}`);
  }

  const ticked = [...items.keys()].filter((k) => {
    const r = found.get(k);
    return r && r.pass && !r.fail;
  }).length;

  console.log(`\n${BOLD}${ticked} of ${items.size} functions proven.${OFF}`);

  if (crosses.length) {
    console.log(`\n${RED}${BOLD}FAIL${OFF} — ${crosses.length} function(s) not proven:\n`);
    for (const c of crosses) console.log(`  ${RED}•${OFF} ${c}`);
    console.log(`\n${DIM}No build artifact should be produced from this state.${OFF}`);
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}PASS${OFF} — every function on the checklist has a passing test.`);
}

main();
