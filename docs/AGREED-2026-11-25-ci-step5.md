# CI step 5: stress, grid and pictures move to one nightly run; a live smoke check after every publish

Decided by the owner on 25 Nov 2026, in his words (relayed by Supervisor 2): "we first build and tweak and
then you do stresstests, do it at night, not during my waking times". He asked the same earlier through the
Opus overseer. Job 9, branch `ci-step5-2026-11-25`. Decided to be built in the order: stress, grid and pictures to the nightly; the live smoke check after every publish.

## What changes

| Check | Before | After |
|---|---|---|
| Volume and concurrency (`npm run stress`, `npm run check:recommend-cap`, `npm run test:sender`) | job `stress` in `ci.yml`: every pull request, every push, and a requirement of `package`, `deploy`, `deploy-cloudflare` and `deploy-www` | job `stress` in `security-grid.yml`, the nightly run (02:17 UTC) and by hand. Not in `ci.yml` at all |
| Security grid (`security-grid.js` and the other scans) | job `grid` in `ci.yml` on every pull request that changes more than documents, after Safari; also nightly | nightly and by hand only (job `grid` of `security-grid.yml`, unchanged) |
| Pictures | job `layout` + `pictures` in `ci.yml` on pull requests that could move a picture; also nightly | nightly and by hand only (job `pictures` of `security-grid.yml`, unchanged) |
| Live smoke check | none | job `smoke` in `ci.yml`, after every push to main, once both Cloudflare publishes have finished |

The security grid already ran nightly in `security-grid.yml` (checked in the file before changing anything), so
the grid and the pictures needed no new code: only their pull-request copies in `ci.yml` were removed. Only the
stress job moved, with its three commands unchanged.

## What stays exactly as strict

- The Function checklist (every pull request that changes more than documents, and every push), Safari, the
  database tests (`test:sql`) and all offline checks on every pull request, unchanged.
- The publishing gate: `package`, `deploy`, `deploy-cloudflare` and `deploy-www` still `needs` every remaining
  check (`database`, `checklist`, `safari`, `package`), no `always()` anywhere near them.
  `scripts/check-deploy-gate.js` now also fails if any of those jobs waits for anything outside that list (so
  the nightly or the smoke check cannot be made a gate by accident), and `npm run check:deploy` still fails the
  build if a publishing job loses a check or gains a status function. `scripts/test-deploy-gate.js` has three
  new deliberate breaks for this.
- `scripts/check-ci-targets.js` (PR = staging, push = live): its rule about the grid now says the opposite
  and is enforced both ways. `ci.yml` must have no `grid`, `layout`, `pictures` or `stress` job and no crowd
  scan; `security-grid.yml` must have a schedule, a manual trigger, no pull-request or push trigger, no live
  secret, and the `grid`, `pictures` and `stress` jobs (stress with its three commands, the grid with the crowd
  scan). Its self-test makes 22 deliberate breaks and needs a failure each time.

## The nightly is NOT part of the publishing gate

Decided with a tool: `ci.yml`'s `deploy`, `deploy-cloudflare` and `deploy-www` run per push to main, and a
`needs` can only name a job of the same workflow run. The nightly is a different workflow, run once a night,
so a push cannot wait for it, and the gate must not pretend it does. What it checks is checked once a night
instead of once a push. A red night means: the supervisor tells the owner in chat the next morning (no phone
notification before launch), and what is found is fixed through a normal pull request. Nothing is rolled back
automatically.

## A red night is visible and keeps its evidence

- A failed scheduled run is a red run on the Actions page, named "Security grid (staging)" (the name is kept:
  `diagnose.yml` watches it by that name).
- The stress job writes the output of its three commands to `nightly-evidence/` and, when any fails, uploads
  it as the artifact `nightly-stress-evidence` (kept 30 days). The pictures job already keeps its
  screenshots on failure. The grid's output is in the job log.

## The live smoke check

`scripts/live-smoke.js`, run by the `smoke` job after both Cloudflare publishes of a push to main. It makes a
few GET requests and creates nothing anywhere: `/REVISION` of the app address is this commit (it waits up to
three minutes for Cloudflare to serve it), the three public pages answer with a page, and the front page
shows its headline. It is not a requirement of any publishing job, so it can never stop a publish; red means
the site that was just published is not what a visitor receives. Its self-test (in `ci.yml`'s tooling
self-tests and in `npm run prepush`) breaks a fake site seven ways and needs a failure each time.

## Minutes, measured

From the CI runs themselves (job start and end times read from GitHub; not estimated):

| Run | Whole run before | Of which: grid + pictures after the browser jobs |
|---|---|---|
| PR 45208068348 (operator-screen-gaps) | 34.6 min | 14.2 min (grid 12.0 + pictures 2.1) |
| PR 45200067571 (activity-log-tidy) | 40.8 min | 13.8 min (grid 13.8, pictures skipped) |
| push to main 45199987421 | 32.6 min | 0 (both skipped on a push) |

Stress took 1.0 to 1.9 min and ran in parallel with the checklist, so removing it saves no wall-clock time on
the critical path: it takes one job off every run and off the gate, as the owner asked. The saving on a pull
request is the grid and pictures chain. The "after" figures are filled in below from this pull request's own
run.

After: a pull request's run now ends at Safari (the grid, the pictures and stress are gone from it). The measured minutes
of this change's own pull request run are in its description (pull request 157 or the number it was given), read from GitHub's
job times; they are not repeated here because a number written into this file would need a second commit and a second run.
The first real nightly run (security-grid.yml, 02:17 UTC) and the first live smoke check (the first push to main after the
merge) are the proofs that can only come after the merge; the supervisor reads both.
