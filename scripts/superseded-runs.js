#!/usr/bin/env node
'use strict';
// Which CI runs does a new commit on a pull request make pointless?
// (.github/workflows/cancel-superseded.yml; docs/AGREED-2026-11-23-ci-speed.md.)
//
// The decision is made HERE, in a function with a self-test, and not in shell, because the one thing this must never do is
// cancel a run that gates publishing. It selects a run ONLY if ALL of these hold:
//   - it is a run of the CI workflow's pull-request kind (event is exactly "pull_request"): never a push (the push-to-main
//     run that publishes), never a manual run (workflow_dispatch), never a scheduled one;
//   - it belongs to the SAME branch as this pull request (headBranch equals the pull request's branch) and that branch
//     is not main;
//   - it is for a DIFFERENT commit than the pull request's current head (the current commit's own run is never touched);
//   - it is still going (in progress, queued, waiting, pending or requested): finished runs are left alone.
//
// Input: the JSON list that `gh run list --json databaseId,headSha,headBranch,event,status` prints, on stdin.
// Environment: BRANCH (the pull request's head branch) and HEAD_SHA (its current head commit).
// Output: the run ids to cancel, one per line.
//   --self-test   checks the rule itself

const GOING = new Set(['in_progress', 'queued', 'waiting', 'pending', 'requested']);

function supersededRuns(runs, branch, headSha) {
  if (!branch || branch === 'main' || !headSha) return [];
  return runs
    .filter((r) => r && r.event === 'pull_request'
      && r.headBranch === branch
      && r.headSha && r.headSha !== headSha
      && GOING.has(r.status))
    .map((r) => r.databaseId);
}

if (process.argv.includes('--self-test')) {
  const NOW = 'bbbb', OLD = 'aaaa';
  const run = (o) => ({ databaseId: 1, headSha: OLD, headBranch: 'feature', event: 'pull_request', status: 'in_progress', ...o });
  const cases = [
    ['an older run of this pull request, in progress, is selected', [run({ databaseId: 11 })], 'feature', NOW, [11]],
    ['queued, waiting, pending and requested ones are selected too', ['queued', 'waiting', 'pending', 'requested'].map((s, i) => run({ databaseId: 20 + i, status: s })), 'feature', NOW, [20, 21, 22, 23]],
    ['a PUSH-TO-MAIN run is never selected (it gates publishing)', [run({ event: 'push', headBranch: 'main' })], 'feature', NOW, []],
    ['a push run even on this branch name is never selected', [run({ event: 'push' })], 'feature', NOW, []],
    ['a manual run is never selected', [run({ event: 'workflow_dispatch' })], 'feature', NOW, []],
    ['a scheduled run is never selected', [run({ event: 'schedule' })], 'feature', NOW, []],
    ['another pull request\'s run is never selected', [run({ headBranch: 'other-feature' })], 'feature', NOW, []],
    ['the current commit\'s own run is never selected', [run({ headSha: NOW })], 'feature', NOW, []],
    ['a finished run is left alone', [run({ status: 'completed' })], 'feature', NOW, []],
    ['a pull request from a branch called main selects nothing', [run({ headBranch: 'main' })], 'main', NOW, []],
    ['a missing branch or commit selects nothing', [run()], '', NOW, []],
    ['a missing head commit selects nothing', [run()], 'feature', '', []],
    ['a mixed list picks exactly the right ones', [run({ databaseId: 1 }), run({ databaseId: 2, event: 'push', headBranch: 'main' }), run({ databaseId: 3, headBranch: 'x' }), run({ databaseId: 4, headSha: NOW }), run({ databaseId: 5, status: 'queued' }), run({ databaseId: 6, status: 'completed' })], 'feature', NOW, [1, 5]],
  ];
  let failed = 0;
  for (const [label, runs, branch, sha, want] of cases) {
    const got = supersededRuns(runs, branch, sha);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let runs = [];
  try { runs = JSON.parse(input || '[]'); } catch (e) { console.error('superseded-runs: input is not JSON'); process.exit(1); }
  for (const id of supersededRuns(runs, process.env.BRANCH || '', process.env.HEAD_SHA || '')) console.log(id);
});
