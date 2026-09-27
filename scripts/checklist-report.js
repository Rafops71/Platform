// Turns test results into a tick/cross table, one line per function, and fails
// if any function on the checklist has no passing test.
//
// docs/CHECKLIST.md is the source of truth for what the platform is supposed to
// do. This script reads it, runs the checks, and matches the two up by an ItemNN
// tag. The exit code is the point: it is 0 only when every listed function has
// at least one passing check and no failing one. CI gates the build on it.
//
// Evidence comes from BOTH suites, because they prove different kinds of thing
// and neither is a substitute for the other:
//
//   db  — sql/tests. An assertion named "Tn ItemNN …" counts for that item.
//         This is where the prohibitions belong: row-level security, the rate
//         limits, what one account cannot read. Proving those through a browser
//         would test the screen, not the rule.
//   ui  — the Playwright `@checklist` group. A test titled `ItemNN_…` counts.
//         This is where the flows belong: the things a person does.
//
// An item may be proven by either or both. What it may NOT be is proven by a
// suite that did not run: if a suite fails to start, every item is reported
// unproven rather than quietly ticked from the other source.
//
//   npm run checklist                 # run both suites and report
//   npm run checklist -- --dry        # report from the last run, do not re-run
//   npm run checklist -- --db-only    # skip the browser suite
//   npm run checklist -- --ui-only    # skip the database suite
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
const UI_RESULTS = path.join(ROOT, 'checklist-results.json');
const DB_RESULTS = path.join(ROOT, 'checklist-sql.txt');

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

function runBrowserSuite() {
  console.log(`${DIM}Running the @checklist browser group …${OFF}`);
  const res = spawnSync(
    'npx',
    ['playwright', 'test', '--grep', '@checklist', '--reporter', 'json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
  );
  // Playwright exits non-zero when tests fail. That is expected: a failure is a
  // cross on the table, not a reason to abandon the report. No output at all is
  // different — the suite never ran, and nothing it would have proven counts.
  if (!res.stdout) {
    return { ok: false, raw: '', why: (res.stderr || 'playwright produced no output').slice(0, 800) };
  }
  fs.writeFileSync(UI_RESULTS, res.stdout);
  return { ok: true, raw: res.stdout };
}

function runDatabaseSuite() {
  console.log(`${DIM}Running the database suite …${OFF}`);
  const res = spawnSync('npm', ['run', '--silent', 'test:sql'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  const raw = (res.stdout || '') + (res.stderr || '');
  // The suite prints "PASS  Tn …" per assertion. If it printed none, it did not
  // get as far as asserting — a cluster that would not start, most often — and
  // the run proves nothing, however the exit code reads.
  if (!/^\s*(PASS|FAIL)\s+/m.test(raw)) {
    return { ok: false, raw, why: lastLines(raw, 6) || 'the database suite asserted nothing' };
  }
  fs.writeFileSync(DB_RESULTS, raw);
  return { ok: true, raw };
}

function lastLines(text, n) {
  return String(text).split('\n').filter((l) => l.trim()).slice(-n).join('\n  ');
}

/** Merge evidence into one map: ItemNN -> { db:{...}, ui:{...} }. */
function blank() {
  return { pass: 0, fail: 0, skip: 0, names: [] };
}

function bucket(found, key, source) {
  const row = found.get(key) || { db: blank(), ui: blank() };
  found.set(key, row);
  return row[source];
}

function collectBrowser(raw, found) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error('Could not parse the Playwright JSON report.');
    process.exit(2);
  }
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      const m = String(spec.title).match(/^Item(\d{2})_(\S+)/);
      if (!m) continue;
      const cell = bucket(found, m[1], 'ui');
      cell.names.push(m[2]);
      const statuses = (spec.tests || []).flatMap((t) => t.results || []).map((r) => r.status);
      if (statuses.length && statuses.every((s) => s === 'skipped')) cell.skip++;
      else if (spec.ok) cell.pass++;
      else cell.fail++;
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of report.suites || []) walk(suite);
}

function collectDatabase(raw, found) {
  // "  PASS  T7 Item50 a participant cannot read another participant's row"
  for (const line of String(raw).split('\n')) {
    const m = line.match(/^\s*(PASS|FAIL)\s+(\S+)\s+Item(\d{2})\b\s*(.*)$/);
    if (!m) continue;
    const cell = bucket(found, m[3], 'db');
    cell.names.push(m[4].trim() || m[2]);
    if (m[1] === 'PASS') cell.pass++;
    else cell.fail++;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const dbOnly = argv.includes('--db-only');
  const uiOnly = argv.includes('--ui-only');
  const items = readChecklist();
  const found = new Map();
  const broken = []; // suites that did not run; nothing they would prove counts

  const wantDb = !uiOnly;
  const wantUi = !dbOnly;

  if (dry) {
    if (wantDb && fs.existsSync(DB_RESULTS)) collectDatabase(fs.readFileSync(DB_RESULTS, 'utf8'), found);
    else if (wantDb) broken.push('database suite — no cached run to read');
    if (wantUi && fs.existsSync(UI_RESULTS)) collectBrowser(fs.readFileSync(UI_RESULTS, 'utf8'), found);
    else if (wantUi) broken.push('browser suite — no cached run to read');
  } else {
    if (wantDb) {
      const db = runDatabaseSuite();
      if (db.ok) collectDatabase(db.raw, found);
      else broken.push(`database suite did not run:\n  ${db.why}`);
    }
    if (wantUi) {
      const ui = runBrowserSuite();
      if (ui.ok) collectBrowser(ui.raw, found);
      else broken.push(`browser suite did not run:\n  ${ui.why}`);
    }
  }

  const crosses = [];
  const width = Math.max(...[...items.values()].map((i) => i.text.length));
  const verdicts = new Map();

  console.log(`\n${BOLD}Function checklist${OFF}\n`);
  for (const [num, item] of items) {
    const row = found.get(num);
    const db = row ? row.db : blank();
    const ui = row ? row.ui : blank();
    const pass = db.pass + ui.pass;
    const fail = db.fail + ui.fail;
    const skip = db.skip + ui.skip;

    // Which suite proved it. Shown because "proven in the database" and "proven
    // through the screen" are different assurances, and the difference matters
    // when deciding whether an item is really covered.
    const by = [db.pass ? 'db' : null, ui.pass ? 'ui' : null].filter(Boolean).join('+');

    let mark, note, verdict;
    if (fail) {
      mark = `${RED}✗${OFF}`; note = `${RED}${fail} failing${OFF}`; verdict = 'fail';
      crosses.push(`${num} — ${fail} failing check(s): ${item.text}`);
    } else if (pass) {
      mark = `${GREEN}✓${OFF}`; note = `${DIM}${pass} passing (${by})${OFF}`; verdict = 'pass';
    } else if (skip) {
      mark = `${YELLOW}−${OFF}`; note = `${YELLOW}skipped / blocked${OFF}`; verdict = 'skip';
      crosses.push(`${num} — every check skipped: ${item.text}`);
    } else {
      mark = `${RED}✗${OFF}`; note = `${RED}no check${OFF}`; verdict = 'none';
      crosses.push(`${num} — no check for "${item.text}"`);
    }
    verdicts.set(num, verdict);
    const must = item.kind === 'MUST NOT' ? `${DIM} [must not]${OFF}` : '';
    console.log(` ${mark} ${num}  ${item.text.padEnd(width)}  ${note}${must}`);
  }

  // A check claiming an item the checklist does not list. Catches the list and
  // the suites drifting apart, which is how a document like this stops meaning
  // anything without anyone noticing.
  const orphans = [...found.keys()].filter((k) => !items.has(k)).sort();
  if (orphans.length) {
    console.log(`\n${RED}Checks for items that are not on the checklist:${OFF}`);
    for (const o of orphans) {
      const r = found.get(o);
      console.log(`  Item${o} — ${[...r.db.names, ...r.ui.names].slice(0, 3).join('; ')}`);
    }
    crosses.push(`checks reference unlisted item(s): ${orphans.join(', ')}`);
  }

  const ticked = [...verdicts.values()].filter((v) => v === 'pass').length;
  console.log(`\n${BOLD}${ticked} of ${items.size} functions proven.${OFF}`);

  if (broken.length) {
    // Deliberately fatal. A suite that did not run has proven nothing, and the
    // other suite's ticks must not be allowed to stand in for it.
    console.log(`\n${RED}${BOLD}INCOMPLETE${OFF} — a suite did not run, so this table cannot be trusted:\n`);
    for (const b of broken) console.log(`  ${RED}•${OFF} ${b}`);
    console.log(`\n${DIM}Fix the run, or use --db-only / --ui-only to state deliberately which half you are checking.${OFF}`);
    process.exit(1);
  }

  if (crosses.length) {
    console.log(`\n${RED}${BOLD}FAIL${OFF} — ${crosses.length} function(s) not proven:\n`);
    for (const c of crosses) console.log(`  ${RED}•${OFF} ${c}`);
    console.log(`\n${DIM}No build artifact should be produced from this state.${OFF}`);
    process.exit(1);
  }

  if (dbOnly || uiOnly) {
    console.log(`${YELLOW}${BOLD}PARTIAL${OFF} — only the ${dbOnly ? 'database' : 'browser'} half was checked.`);
    process.exit(0);
  }

  console.log(`${GREEN}${BOLD}PASS${OFF} — every function on the checklist has a passing check.`);
}

main();
