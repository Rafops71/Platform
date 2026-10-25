#!/usr/bin/env node
//
// The morning report: what changed, what was tested, what passed, what failed,
// and what is not working - written by a script, not by a model.
//
// WHY A SCRIPT
//
// The owner asked to wake up to a report without having to supervise anything.
// The tempting version asks an AI to summarise the night. That would be a model
// describing the work of a model, costing usage every day and saying something
// slightly different each time - the opposite of what this project's
// verification rule demands. Everything below is read from GitHub's own records
// and the live site, and the same night always produces the same report.
//
// WHAT IT CHECKS, AND WHY EACH ONE
//
//   - commits to main in the last 24 hours, so nothing changes unannounced
//   - every workflow run in that window, failures named
//   - the latest CI run on main, job by job, and the checklist's own
//     "N of N functions proven" line read from its log
//   - scheduled jobs that went GREEN WHILE SKIPPING their real work. The email
//     sender did exactly that for weeks: every run green, no email ever sent.
//     A skipped step in a scheduled run is reported as NOT WORKING, never as ok.
//   - which revision the live site is actually serving (/REVISION), compared
//     with main, so "deployed" is a fact read off the site and not an inference
//   - open pull requests and whether their checks pass
//
// RUNNING IT
//
//   GITHUB_TOKEN=... node scripts/morning-report.js            # prints the report
//   GITHUB_TOKEN=... node scripts/morning-report.js --issue    # also files it as an issue
//
// In .github/workflows/morning-report.yml it runs on a schedule and files the
// issue; on a pull request it only writes to the job summary, so a change to
// this script is tested before it can post anything.

'use strict';

const REPO = process.env.GITHUB_REPOSITORY || 'Rafops71/Platform';
const TOKEN = process.env.GITHUB_TOKEN || '';
const SITE = process.env.SITE_URL || 'https://rafops71.github.io/Platform/';
const OWNER_LOGIN = process.env.REPORT_MENTION || 'Rafops71';
const FILE_ISSUE = process.argv.includes('--issue');
const API = 'https://api.github.com';
const HOURS = 24;

// Local testing only: REPORT_VIA_GH=1 reads GitHub through the `gh` command a
// Claude Code session already has, so the report can be checked against real
// data before CI ever runs it. In GitHub Actions the built-in GITHUB_TOKEN is
// used and this path is never taken. Read-only: it refuses to file an issue.
function viaGh(pathname, raw) {
  const { execFileSync } = require('child_process');
  const out = execFileSync('gh', ['api', pathname.replace(API, '')], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return raw ? out : JSON.parse(out);
}

async function gh(pathname, { raw = false, method = 'GET', body } = {}) {
  if (process.env.REPORT_VIA_GH) {
    if (method !== 'GET') throw new Error('REPORT_VIA_GH is read-only; it will not file an issue.');
    return viaGh(pathname, raw);
  }
  const res = await fetch(pathname.startsWith('http') ? pathname : API + pathname, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${method} ${pathname} -> HTTP ${res.status}`);
  return raw ? res.text() : res.json();
}

const short = (sha) => (sha || '').slice(0, 7);
const firstLine = (s) => String(s || '').split('\n')[0];
const hhmm = (iso) => (iso || '').slice(11, 16);

async function main() {
  const since = new Date(Date.now() - HOURS * 3600e3).toISOString();
  const problems = [];   // anything that needs the owner, in plain words
  const out = [];

  // ------------------------------------------------------------- changes --
  const commits = await gh(`/repos/${REPO}/commits?sha=main&since=${since}&per_page=50`);
  const head = (await gh(`/repos/${REPO}/commits/main`)).sha;

  // ------------------------------------------------------- workflow runs --
  const runs = (await gh(`/repos/${REPO}/actions/runs?created=>=${since}&per_page=100`)).workflow_runs || [];
  const byWorkflow = new Map();
  for (const r of runs) {
    if (!byWorkflow.has(r.name)) byWorkflow.set(r.name, []);
    byWorkflow.get(r.name).push(r);
  }

  // A scheduled job that skipped its real work is not working, however green
  // its run is. Checked on the latest scheduled run of each workflow.
  const idle = [];
  for (const [name, list] of byWorkflow) {
    const sched = list.find((r) => r.event === 'schedule' && r.status === 'completed');
    if (!sched) continue;
    const jobs = (await gh(`/repos/${REPO}/actions/runs/${sched.id}/jobs`)).jobs || [];
    for (const j of jobs) {
      for (const st of j.steps || []) {
        // GitHub's own post-job housekeeping steps are skipped routinely and
        // mean nothing; only steps the workflow itself defines count.
        if (st.conclusion === 'skipped' && !/^(Post |Set up job|Complete job)/.test(st.name)) {
          idle.push(`**${name}** ran green but skipped *${st.name}*`);
        }
      }
    }
  }

  // ------------------------------------------------- latest CI on main --
  const ciRuns = (await gh(`/repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&per_page=1`)).workflow_runs || [];
  const ci = ciRuns[0];
  let ciJobs = [];
  let checklistLine = 'not read';
  if (ci) {
    ciJobs = (await gh(`/repos/${REPO}/actions/runs/${ci.id}/jobs`)).jobs || [];
    const cl = ciJobs.find((j) => j.name === 'Function checklist');
    if (cl && cl.conclusion) {
      try {
        const log = await gh(`/repos/${REPO}/actions/jobs/${cl.id}/logs`, { raw: true });
        const m = log.match(/(\d+) of (\d+) functions proven/);
        checklistLine = m ? `${m[1]} of ${m[2]} functions proven` : 'the log did not contain the proven-count line';
        if (m && m[1] !== m[2]) problems.push(`The checklist proves only ${m[1]} of ${m[2]} functions.`);
      } catch (e) {
        checklistLine = `could not read the log (${e.message})`;
      }
    }
  }

  // ------------------------------------------------------- the live site --
  let live = 'unknown';
  try {
    const rev = (await (await fetch(SITE + 'REVISION', { cache: 'no-store' })).text()).trim();
    if (/^[0-9a-f]{40}$/.test(rev)) {
      live = rev === head
        ? `serving the latest main, \`${short(rev)}\``
        : `serving \`${short(rev)}\`; main is at \`${short(head)}\` - the newer commit has not passed every check, or has not been published yet`;
    } else {
      live = 'not publishing a revision - the site is still on the old branch publishing, outside the gate';
      problems.push('The live site is not yet published by the gate (Settings > Pages > Source is not "GitHub Actions").');
    }
  } catch (e) {
    live = `could not be reached (${e.message})`;
    problems.push('The live site could not be reached.');
  }

  // ------------------------------------------------------ pull requests --
  const prs = await gh(`/repos/${REPO}/pulls?state=open&per_page=20`);
  const prLines = [];
  for (const pr of prs) {
    const checks = (await gh(`/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=50`)).check_runs || [];
    // The test suite itself, by workflow, for this exact commit. Check runs
    // alone are not enough: a queued workflow creates none until its jobs
    // start, so the reviewer's job reporting green made the second version of
    // this report call a pull request "all checks green" whose tests had not
    // started. A pull request is green only when CI has FINISHED on its commit.
    const ciForPr = ((await gh(`/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${pr.head.sha}&per_page=5`)).workflow_runs || [])
      .filter((r) => r.event === 'pull_request' || r.event === 'workflow_dispatch')[0];
    const bad = checks.filter((c) => c.conclusion && !['success', 'skipped', 'neutral'].includes(c.conclusion));
    const pending = checks.filter((c) => !c.conclusion);
    // No check runs at all is NOT green: nothing has been tested yet. The first
    // version of this report said "all checks green" for a pull request whose
    // CI had not started - the exact believed-versus-tested gap it exists for.
    const state = bad.length ? `**failing:** ${bad.map((c) => c.name).join(', ')}`
      : !ciForPr ? '**tests have not run on this commit - not tested**'
      : ciForPr.status !== 'completed' ? `tests ${ciForPr.status} - not yet tested`
      : ciForPr.conclusion !== 'success' ? `**tests ${ciForPr.conclusion}**`
      : pending.length ? `tests passed; ${pending.length} other check(s) still running`
      : 'tests passed, all checks green';
    prLines.push(`- #${pr.number} ${pr.title} — ${state}`);
  }

  // ------------------------------------------------------ assemble it --
  // A cancelled run is only a problem if nothing replaced it. GitHub keeps one
  // pending run per concurrency group and cancels the older one when a newer
  // push arrives - that is housekeeping, and reporting it daily would teach the
  // owner to ignore the report. But a cancellation with no newer run of the
  // same workflow on the same branch is work silently lost (it killed the
  // Spanish film twice), so that one is still reported.
  const replaced = (r) => runs.some((o) => o.workflow_id === r.workflow_id &&
    o.head_branch === r.head_branch && new Date(o.created_at) > new Date(r.created_at));
  const failedRuns = runs.filter((r) => r.conclusion && !['success', 'skipped', 'neutral'].includes(r.conclusion)
    && !(r.conclusion === 'cancelled' && replaced(r)));
  for (const r of failedRuns) problems.push(`**${r.name}** ${r.conclusion} at ${hhmm(r.created_at)} UTC (run ${r.run_number}).`);
  for (const i of idle) problems.push(i + ' - so it is not doing its job.');
  const ciBad = ciJobs.filter((j) => j.conclusion && !['success', 'skipped'].includes(j.conclusion));
  for (const j of ciBad) problems.push(`Latest CI on main: **${j.name}** ${j.conclusion}.`);

  const day = new Date().toISOString().slice(0, 10);
  out.push(`# Morning report — ${day}`);
  out.push('');
  out.push(problems.length
    ? `## ⚠️ ${problems.length} thing(s) need attention`
    : '## ✅ Nothing needs attention');
  if (problems.length) { out.push(''); for (const p of problems) out.push(`- ${p}`); }
  out.push('');
  out.push(`## Changes to main, last ${HOURS} hours`);
  out.push(commits.length
    ? commits.map((c) => `- \`${short(c.sha)}\` ${firstLine(c.commit.message)}`).join('\n')
    : '- none');
  out.push('');
  out.push('## Latest test run on main');
  if (ci) {
    out.push(`Run ${ci.run_number}, commit \`${short(ci.head_sha)}\`, ${ci.conclusion || ci.status}.`);
    out.push(`Checklist: **${checklistLine}**.`);
    for (const j of ciJobs) {
      const mark = !j.conclusion ? '⏳' : j.conclusion === 'success' ? '✅' : j.conclusion === 'skipped' ? '➖' : '❌';
      out.push(`- ${mark} ${j.name}: ${j.conclusion || 'still running'}`);
    }
  } else {
    out.push('- no CI run found on main');
  }
  out.push('');
  out.push('## Live site');
  out.push(`- ${live}`);
  out.push('');
  out.push(`## Everything that ran, last ${HOURS} hours`);
  for (const [name, list] of byWorkflow) {
    const ok = list.filter((r) => r.conclusion === 'success').length;
    const running = list.filter((r) => !r.conclusion).length;
    const bad = list.length - ok - running;
    out.push(`- ${name}: ${list.length} run(s), ${ok} succeeded` +
      (bad ? `, **${bad} did not**` : '') + (running ? `, ${running} still running` : ''));
  }
  if (!byWorkflow.size) out.push('- nothing ran');
  out.push('');
  out.push('## Open pull requests');
  out.push(prLines.length ? prLines.join('\n') : '- none');
  out.push('');
  out.push('---');
  out.push(`Written by \`scripts/morning-report.js\` from GitHub's own records — no AI, no guesswork. @${OWNER_LOGIN}`);

  const text = out.join('\n');
  console.log(text);

  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  }
  if (FILE_ISSUE) {
    const issue = await gh(`/repos/${REPO}/issues`, {
      method: 'POST',
      body: { title: `Morning report — ${day}${problems.length ? ` — ${problems.length} need attention` : ' — all clear'}`, body: text },
    });
    console.log(`\nFiled as issue #${issue.number}: ${issue.html_url}`);
  }
}

main().catch((e) => {
  console.error('The morning report could not be produced:', e.message);
  process.exit(1);
});
