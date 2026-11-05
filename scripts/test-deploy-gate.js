#!/usr/bin/env node
'use strict';
// Proves the deploy gate still catches the breaks it exists to catch.
//
// Each case copies the real .github/workflows into a temporary folder, breaks
// one thing the way a careless edit would, and runs check-deploy-gate.js
// against that copy. The gate must fail every time. The unbroken copy must
// pass. If a later edit weakens the gate, one of these cases starts passing
// and this script fails.
//
//   node scripts/test-deploy-gate.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const GATE = path.join(__dirname, 'check-deploy-gate.js');
const SRC = path.join(REPO, '.github', 'workflows');

function runGate(root) {
  return spawnSync(process.execPath, [GATE], {
    env: { ...process.env, DEPLOY_GATE_ROOT: root }, encoding: 'utf8',
  });
}

// Replace the first match of `from` in `file` with `to`. Fails loudly if the
// text is not there, so a moved line cannot make a case pass by accident.
function edit(file, from, to) {
  return (dir) => {
    const p = path.join(dir, '.github', 'workflows', file);
    const s = fs.readFileSync(p, 'utf8');
    if (!s.includes(from)) throw new Error(`test setup: "${from.slice(0, 60)}" not found in ${file}`);
    fs.writeFileSync(p, s.replace(from, to));
  };
}

const DEMO_IF = "    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      deployments: write\n    concurrency:\n      group: cloudflare-demo-deploy";

const cases = [
  ['the unbroken copy passes', (d) => {}, true],
  ['ci.yml publish job gets always()', edit('ci.yml',
    "    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      deployments: write\n    concurrency:\n      group: cloudflare-deploy\n",
    "    if: always() && github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      deployments: write\n    concurrency:\n      group: cloudflare-deploy\n"), false],
  ['demo publish job gets always()', edit('demo-pages.yml', DEMO_IF, DEMO_IF.replace("    if: github", "    if: always() && github")), false],
  ['demo publish job drops the wait for the build', edit('demo-pages.yml', '    needs: [build]\n    if:', '    needs: []\n    if:'), false],
  ['demo publish job loses the missing-secret failure', edit('demo-pages.yml', 'exit 1\n          fi\n      - uses: actions/setup-node', 'true\n          fi\n      - uses: actions/setup-node'), false],
  ['demo publish job deploys to the platform project', edit('demo-pages.yml', '--project-name=myplatform-demo', '--project-name=platform'), false],
  ['a second file gains a Cloudflare publish step', (d) => {
    const p = path.join(d, '.github', 'workflows', 'purpose.yml');
    fs.appendFileSync(p, '\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: cloudflare/wrangler-action@v4\n');
  }, false],
  ['a GitHub Pages deploy appears in demo-pages.yml', (d) => {
    const p = path.join(d, '.github', 'workflows', 'demo-pages.yml');
    fs.appendFileSync(p, '\n  pages:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/deploy-pages@v5\n');
  }, false],
  ['the Operator demo publishes to the member demo project', (d) => {
    const p = path.join(d, '.github', 'workflows', 'operator-demo-pages.yml');
    const t = fs.readFileSync(p, 'utf8').replace('--project-name=myplatform-operator-demo', '--project-name=myplatform-demo');
    fs.writeFileSync(p, t);
  }, false],
];

let failed = 0;
for (const [name, breakFn, shouldPass] of cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  for (const f of fs.readdirSync(SRC)) {
    fs.copyFileSync(path.join(SRC, f), path.join(dir, '.github', 'workflows', f));
  }
  breakFn(dir);
  const r = runGate(dir);
  const passed = r.status === 0;
  const ok = passed === shouldPass;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (gate exit ${r.status})`);
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failed) { console.error(`\n${failed} case(s) did not behave as required.`); process.exit(1); }
console.log(`\nAll ${cases.length} cases behave as required: the gate passes the real copy and fails every break.`);
