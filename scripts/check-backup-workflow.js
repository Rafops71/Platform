#!/usr/bin/env node
'use strict';
// Fails the build if .github/workflows/database-backup.yml stops being safe to leave running every night on a PUBLIC repository.
// Plain text, no YAML library (none is installed, and this check must not depend on adding one).
//
// WHAT IT GUARDS, each a way the backup could go wrong quietly or leak:
//   - the schedule and the manual trigger are both there (a backup nobody triggers is not a backup);
//   - a missing secret turns the run RED: SUPABASE_DB_URL, BACKUP_PASSPHRASE and BACKUP_REPO_TOKEN are all named in the
//     "refuse half-configured" step, and nothing skips a step on a secret (send-emails.yml does, and has not sent for weeks);
//   - no step is allowed to hide a failure (continue-on-error, always(), failure(), cancelled());
//   - no artifact is uploaded here (this repository is public, an artifact is readable by everybody);
//   - a secret is only ever handed over as an environment variable, never inside a `run:` line, an `echo`, a URL or `with:`;
//   - nothing prints the passphrase, the token or the database address;
//   - the storage goes through scripts/backup-repo.sh (no raw `git push` or token in the workflow);
//   - the repository's privacy is checked at run time before anything is pushed.
//
//   node scripts/check-backup-workflow.js            npm run check:backup-workflow (part of npm run prepush)
//   node scripts/check-backup-workflow.js --self-test

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.github', 'workflows', 'database-backup.yml');

function problemsIn(text) {
  const lines = text.split('\n');
  const code = lines.filter((l) => !/^\s*#/.test(l));       // comments may say anything
  const body = code.join('\n');
  const p = [];
  if (!/cron:\s*'17 3 \* \* \*'/.test(body)) p.push("the schedule '17 3 * * *' (03:17 UTC daily) is missing");
  if (!/workflow_dispatch:/.test(body)) p.push('workflow_dispatch (the manual trigger) is missing');
  const refuse = body.slice(body.indexOf('Refuse to run half-configured'), body.indexOf('Install the PostgreSQL 17 client'));
  for (const [secret, variable] of [['SUPABASE_DB_URL', 'DB_URL'], ['BACKUP_PASSPHRASE', 'PASSPHRASE'], ['BACKUP_REPO_TOKEN', 'REPO_TOKEN']]) {
    const handedOver = refuse.includes(`${variable}: \${{ secrets.${secret} }}`);
    const tested = refuse.includes(`[ -z "$${variable}" ]`);
    if (!handedOver || !tested) p.push(`the "refuse half-configured" step does not test ${secret} for being empty`);
  }
  if (/continue-on-error|always\s*\(|failure\s*\(|cancelled\s*\(/.test(body)) p.push('a step is allowed to hide a failure (continue-on-error / always() / failure() / cancelled())');
  if (/^\s*if:.*secrets\./m.test(body)) p.push('a step is skipped on a secret (if: ... secrets.): a missing secret must turn the run red, not skip it');
  if (/upload-artifact/.test(body)) p.push('an artifact is uploaded: this repository is public');
  if (/git\s+(-c\s+\S+\s+)*push|git\s+clone/.test(body)) p.push('the workflow runs git push/clone itself: it must go through scripts/backup-repo.sh');
  if (!body.includes('scripts/backup-repo.sh push') || !body.includes('scripts/backup-repo.sh verify') || !body.includes('scripts/backup-repo.sh retention') || !body.includes('scripts/backup-repo.sh teardown-test')) p.push('the workflow does not call every scripts/backup-repo.sh step (push, verify, retention, teardown-test)');
  if (!/\.private/.test(body)) p.push('the workflow does not check the backup repository is private');
  // Every use of a secret is an environment-variable line: KEY: ${{ secrets.NAME }} and nothing else.
  code.forEach((l, i) => {
    if (/secrets\./.test(l) && !/^\s+[A-Z_]+:\s*\$\{\{\s*secrets\.[A-Z_]+\s*\}\}\s*$/.test(l)) p.push(`a secret is used somewhere other than an env: line (line ${i + 1} of the code: ${l.trim()})`);
  });
  // Nothing may print a secret or the database address.
  code.forEach((l) => {
    if (/\b(echo|printf)\b.*\$\{?(PASSPHRASE|REPO_TOKEN|BACKUP_REPO_TOKEN|GH_TOKEN|DB_URL|BACKUP_PASSPHRASE)\b/.test(l)) p.push(`a line prints a secret: ${l.trim()}`);
  });
  if (/\bset\s+-x\b|bash\s+-x|\bxtrace\b/.test(body)) p.push('shell tracing (set -x) would print the commands with their secrets');
  return p;
}

if (process.argv.includes('--self-test')) {
  const good = fs.readFileSync(FILE, 'utf8');
  const cases = [
    ['the real workflow is clean', good, 0],
    ['an uploaded artifact is caught', good.replace('      - name: Say what happened', '      - uses: actions/upload-artifact@v6\n        with:\n          path: x\n      - name: Say what happened'), 1],
    ['a missing refuse-check for the token is caught', good.replace('[ -z "$REPO_TOKEN" ] && missing="$missing BACKUP_REPO_TOKEN"', ''), 1],
    ['continue-on-error is caught', good.replace('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    continue-on-error: true\n'), 1],
    ['a secret in a run line is caught', good.replace('run: scripts/backup-repo.sh retention 30', 'run: scripts/backup-repo.sh retention 30 ${{ secrets.BACKUP_REPO_TOKEN }}'), 1],
    ['echoing a secret is caught', good.replace('echo "All three secrets present."', 'echo "$PASSPHRASE"'), 1],
    ['a raw git push is caught', good.replace('run: scripts/backup-repo.sh retention 30', 'run: git push origin main'), 2],
    ['a step skipped on a secret is caught', good.replace('      - name: Say what happened', "      - name: x\n        if: ${{ secrets.BACKUP_REPO_TOKEN != '' }}\n        run: echo hi\n      - name: Say what happened"), 2],
  ];
  let failed = 0;
  for (const [label, text, atLeast] of cases) {
    const n = problemsIn(text).length;
    const ok = atLeast === 0 ? n === 0 : n >= atLeast;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (found ${n} problem(s))`}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}

const problems = problemsIn(fs.readFileSync(FILE, 'utf8'));
if (problems.length) {
  console.error('database-backup.yml has problems:\n' + problems.map((x) => '  - ' + x).join('\n'));
  process.exit(1);
}
console.log('database-backup.yml: schedule and manual trigger present; all three secrets checked and a missing one is red; no artifact; secrets only as env: lines; storage only through scripts/backup-repo.sh; privacy checked at run time.');
