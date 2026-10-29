#!/usr/bin/env node
//
// Fails the build if the deploy job in .github/workflows/ci.yml could publish
// the site without every check having passed.
//
// WHY A SCRIPT, AND NOT A COMMENT
//
// The whole gate rests on one documented GitHub rule - "If a job fails or is
// skipped, all jobs that need it are skipped" - and on one exception to it:
// a job whose `if:` uses always() (or another status function such as
// failure() or !cancelled()) runs anyway. One word in one line would turn the
// gate back into an alarm that rings after members already have the broken
// version, which is exactly the state this project was in until 2026-10-25.
// A comment in ci.yml saying "never use always() here" cannot enforce itself.
// This can, and it costs a second.
//
// Plain text, not a YAML parser: no YAML library is installed, and this check
// must not depend on adding one.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
const REQUIRED = ['database', 'checklist', 'stress', 'safari', 'package'];
const STATUS_FUNCTIONS = /\b(always|failure|cancelled)\s*\(/;

const text = fs.readFileSync(FILE, 'utf8');
const lines = text.split('\n');
const problems = [];

// A publishing job's block: from "  <job>:" to the next two-space job key.
// Every job that publishes anywhere gets the same checks.
function checkPublishingJob(job) {
const start = lines.findIndex(l => new RegExp(`^  ${job}:\\s*$`).test(l));
if (start === -1) {
  problems.push(`ci.yml has no \`${job}\` job, so nothing publishes the site behind the gate.`);
} else {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start, end).filter(l => !/^\s*#/.test(l)).join('\n');

  const needs = (block.match(/^\s{4}needs:\s*\[([^\]]*)\]/m) || [])[1];
  if (!needs) {
    problems.push(`the ${job} job has no \`needs:\` list, so it would not wait for the checks.`);
  } else {
    const have = needs.split(',').map(s => s.trim()).filter(Boolean);
    for (const req of REQUIRED) {
      if (!have.includes(req)) problems.push(`the ${job} job does not wait for \`${req}\`.`);
    }
  }

  const cond = (block.match(/^\s{4}if:\s*(.+)$/m) || [])[1] || '';
  if (STATUS_FUNCTIONS.test(cond)) {
    problems.push(`the ${job} job's \`if:\` uses a status function (${cond.trim()}), so it would publish even after a failed check.`);
  }
  if (!/refs\/heads\/main/.test(cond)) {
    problems.push(`the ${job} job is not limited to main, so a branch run could publish.`);
  }
}
}
for (const job of ['deploy', 'deploy-cloudflare', 'deploy-www']) checkPublishingJob(job);

// Exactly one place may publish. A second deploy-pages step anywhere else in
// the workflows would be a way round the gate.
const wfDir = path.dirname(FILE);
for (const f of fs.readdirSync(wfDir).filter(n => /\.ya?ml$/.test(n))) {
  const body = fs.readFileSync(path.join(wfDir, f), 'utf8')
    .split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  const count = (body.match(/actions\/deploy-pages@/g) || []).length;
  if (f === 'ci.yml' ? count !== 1 : count !== 0) {
    problems.push(`${f} contains ${count} deploy-pages step(s); only ci.yml's deploy job may publish.`);
  }
  const cf = (body.match(/cloudflare\/wrangler-action@/g) || []).length;
  if (f === 'ci.yml' ? cf !== 2 : cf !== 0) {
    problems.push(`${f} contains ${cf} wrangler-action step(s); only ci.yml's deploy-cloudflare and deploy-www jobs may publish there (ci.yml: exactly 2).`);
  }
}

if (problems.length) {
  console.error('Deploy gate: FAIL\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Deploy gate: OK. The site is published only from main, only after ${REQUIRED.join(', ')} pass.`);
