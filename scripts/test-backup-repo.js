#!/usr/bin/env node
'use strict';
// Self-test of scripts/backup-repo.sh against a LOCAL bare git repository (no network, no token, nothing real).
// It proves the parts that can go wrong quietly: the file name, the read-back sha256 check, the retention rule (only
// db-YYYY-MM-DD.dump.enc files, only older than the cutoff, and nothing else), the teardown test, and that a
// mismatching stored copy makes `verify` fail.
//
//   node scripts/test-backup-repo.js        (npm run test:backup-repo; part of npm run prepush)

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'backup-repo.sh');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-repo-test-'));
const bare = path.join(root, 'bare.git');
const seed = path.join(root, 'seed');
let failed = 0;

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failed++; if (detail) console.log(detail.split('\n').map((l) => '        ' + l).join('\n')); }
}
const script = (args, env = {}) => sh('bash', [SCRIPT, ...args], { env: { ...process.env, BACKUP_REPO_URL: `file://${bare}`, BACKUP_REPO_TOKEN: '', ...env } });
const ls = () => sh('git', ['-C', path.join(root, 'view'), 'ls-tree', '-r', '--name-only', 'HEAD']).out.split('\n').filter(Boolean).sort();
function refreshView() { fs.rmSync(path.join(root, 'view'), { recursive: true, force: true }); sh('git', ['clone', '--quiet', bare, path.join(root, 'view')]); }
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

try {
  // A bare repository with a README and a mix of dated files, as the real one will look after some weeks.
  sh('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
  sh('git', ['clone', '--quiet', bare, seed]);
  sh('git', ['-C', seed, 'config', 'user.name', 't']); sh('git', ['-C', seed, 'config', 'user.email', 't@example.invalid']);
  fs.writeFileSync(path.join(seed, 'README.md'), 'readme\n');
  for (const d of [day(-100), day(-31), day(-30), day(-29), day(-1)]) fs.writeFileSync(path.join(seed, `db-${d}.dump.enc`), `old ${d}\n`);
  fs.writeFileSync(path.join(seed, 'db-2026-13-45.dump.enc'), 'not a date\n');            // a name that matches but is no date
  fs.writeFileSync(path.join(seed, 'db-2020-01-01.dump.enc.bak'), 'other\n');             // not exactly the pattern
  fs.writeFileSync(path.join(seed, 'notes-2020-01-01.txt'), 'other\n');
  sh('git', ['-C', seed, 'add', '-A']); sh('git', ['-C', seed, 'commit', '--quiet', '-m', 'seed']); sh('git', ['-C', seed, 'push', '--quiet', 'origin', 'HEAD:main']);

  // push + verify
  const enc = path.join(root, 'backup.dump.enc');
  fs.writeFileSync(enc, Buffer.concat([Buffer.from('Salted__'), Buffer.alloc(5000, 7)]));
  const today = new Date().toISOString().slice(0, 10);
  let r = script(['push', enc]);
  check('push stores db-<today>.dump.enc and says its sha256', r.code === 0 && /Stored db-\d{4}-\d{2}-\d{2}\.dump\.enc/.test(r.out) && /sha256 [0-9a-f]{64}/.test(r.out), r.out);
  refreshView();
  check('the file is in the repository under the dated name', ls().includes(`db-${today}.dump.enc`), ls().join('\n'));
  r = script(['verify', enc]);
  check('verify: the stored copy has the same sha256 as the local file', r.code === 0 && /byte-for-byte/.test(r.out), r.out);
  const other = path.join(root, 'other.enc'); fs.writeFileSync(other, 'a different file');
  r = script(['verify', other]);
  check('verify FAILS when the stored copy differs', r.code !== 0 && /differs/.test(r.out), r.out);
  r = script(['push', enc]);
  check('pushing the same bytes twice in a day changes nothing and does not fail', r.code === 0 && /already stored|Stored db-/.test(r.out), r.out);
  const big = path.join(root, 'big.enc'); fs.closeSync(fs.openSync(big, 'w')); fs.truncateSync(big, 91 * 1024 * 1024);
  r = script(['push', big]);
  check('a file over 90 MB is refused before any push', r.code !== 0 && /too big for a git push/.test(r.out), r.out);

  // retention
  r = script(['retention', '30']);
  refreshView();
  const left = ls();
  check('retention deletes the dated files older than 30 days and prints them', r.code === 0 && r.out.includes(`db-${day(-100)}.dump.enc`) && r.out.includes(`db-${day(-31)}.dump.enc`), r.out);
  check('retention keeps the 30-day-old, newer and today files', [day(-30), day(-29), day(-1), today].every((d) => left.includes(`db-${d}.dump.enc`)), left.join('\n'));
  check('retention never touches the README, a non-date name, a .bak or another file', ['README.md', 'db-2026-13-45.dump.enc', 'db-2020-01-01.dump.enc.bak', 'notes-2020-01-01.txt'].every((f) => left.includes(f)), left.join('\n'));
  check('retention deleted nothing else', left.length === 8 && !left.includes(`db-${day(-100)}.dump.enc`), left.join('\n'));
  r = script(['retention', '30']);
  check('retention run again has nothing to delete', r.code === 0 && /nothing older/.test(r.out), r.out);

  // teardown test
  const before = ls();
  r = script(['teardown-test']);
  refreshView();
  check('teardown-test pushes a dummy file, reads it back, deletes it, reads back that it is gone', r.code === 0 && /1\. pushed and read back/.test(r.out) && /2\. deleted and read back/.test(r.out), r.out);
  check('teardown-test leaves the repository exactly as it was', JSON.stringify(ls()) === JSON.stringify(before), ls().join('\n'));

  // the token never appears in output
  r = script(['push', enc], { BACKUP_REPO_TOKEN: 'ghp_SECRETSECRETSECRET' });
  check('the token is not printed', !r.out.includes('SECRETSECRET'), r.out);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll backup-repo checks passed.');
process.exit(failed ? 1 : 0);
