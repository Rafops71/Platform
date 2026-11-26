# AGREED 23 Nov 2026: CI speed (owner approved the roadmap and this job on 23 Nov; BATCH GO)
Source: `docs/ROADMAP-2026-11-22.md` section 0.6 and `docs/CI-SPEED-AI-ADVICE-2026-11-22.md` (both on the supervisor's notes branch), relayed by Supervisor 2. Target: a normal run of about 10 minutes instead of about 30.

**The rules this job keeps (supervisor, 23 Nov):** every check stays exactly as strict; no test skipped, weakened or moved out of the gate; `check:deploy` still passes; a push to main still runs everything and still gates publishing; pull requests still run on STAGING and pushes to main on LIVE.

**What this pull request does (steps 1 and 2 of 0.6):**
1. Stop double waiting. The Playwright browser download is cached in every job that installs a browser (npm was already cached in every job). A new workflow, `.github/workflows/cancel-superseded.yml`, cancels the older CI runs of the SAME pull request when a new commit arrives. It cannot be done with `cancel-in-progress` in `ci.yml`, because that group is shared by every pull request on purpose (staging has one writer). It never touches runs on main or manual runs: the choice is made by `scripts/superseded-runs.js` (13 self-tests, including a push-to-main run, a manual run, another branch and the current commit), and `scripts/check-cancel-workflow.js` fails the build if the workflow ever gains another trigger, a second `gh run cancel`, or ids that do not come from that script.
2. A pull request that changes only documents (`docs/**` except `docs/CHECKLIST.md`, `mockups/**`, Markdown files in the repository root) skips the browser chain (Function checklist, Safari, the grid, the pictures). Everything else, wording in `js/i18n.js` included, runs it, because a label change can break a browser assertion that only that suite sees. A push to main and a manual run always run everything. The database tests and the offline checks always run.

**What it does NOT do, and why:** steps 3 and 4 (each test makes and cleans its own data, then parallel workers) are the large saving and the large risk, and are separate pull requests that need the supervisor's go. Step 5 (a short live smoke after merge instead of the full rerun; Safari and the load test nightly) is the owner's choice, later, by button, because it changes the gate.

**A change to the roadmap's wording (supervisor, 23 Nov):** `docs/ROADMAP-2026-11-22.md` section 0.6, step 2, says "word-only changes (i18n/labels) take the short line". That is NOT what was built: only documents-only pull requests take it, and wording in `js/i18n.js` runs the full line. Reason: #137 (a label rename) needed three browser assertions changed, and only the browser suites see that. The roadmap file is on the supervisor's notes branch, so the supervisor changes that line there.

**What to expect, honestly:** steps 1 and 2 do not reach the 10-minute target. The realistic result after the parallel steps is about 8 to 9 minutes for a push to main and about 18 minutes for a pull-request run, until the security grid (8 to 10 minutes, ten scripts in a row, behind the checklist and Safari because staging has one writer) is reworked.

## PR 2 (23 Nov, supervisor's go): per-worker tag, the audit of the spec files, 2 workers on pull requests
- Every account a test makes carries its worker's slot in its tag (`w0`, `w1`), so one worker's cleanup never deletes another's.
- Five spec files assert on whole tables or seed mass data (`tests/e2e/exclusive-specs.js`, with the reason for each); with more than one worker they run alone, after the others, on one worker, in the project `chromium-exclusive`; the report merges the two runs.
- Two assertions that a neighbour's activity could change were made specific (Item 86's email count excludes mail about listings; the Operator-translate "keeps nothing" test counts only notifications tied to its own listings and messages). Nothing was removed or loosened beyond ignoring rows a neighbour made.
- Pull requests run with `E2E_WORKERS=2`; a push to main stays at 1 until the pull-request runs have shown the parallel suite stable over several runs. Four workers wait for the numbers.
- The guard in `scripts/check-ci-targets.js` now also requires the `changes` job's push branch to end (`exit 0`) right after writing `browser=true`.

### PR 2, first run found a third hazard (teardown itself)
The first 2-worker run failed 3 tests, all one cause: `cleanup()` removed mail, invitations and activity rows by the
WHOLE `myplatform-e2e-` prefix, so one worker's teardown deleted the other worker's invitations (`createAccount()` then
failed with "Registration is by invitation only", seen in the Auth log) and its queued mail (Item 86 counted 2, then 0).
Those three deletes now match this run's own prefix and the addresses of the accounts being swept (orphans included).

### The guard for the exclusive list (supervisor's decision, 23 Nov)
`npm run check:exclusive` (`scripts/check-exclusive-specs.js`, in `npm run prepush` and in CI's offline checks) fails when a spec that is not in `tests/e2e/exclusive-specs.js` sends a SELECT with count/sum/avg/min/max from a shared table with no WHERE, or when a listed file no longer exists. A spec that is safe beside others despite such a query says so with a `whole-table-ok: <reason>` comment. Limit, said plainly: it sees whole-table aggregates only, not every way an assertion can depend on a neighbour, so the audit above still applies to a new spec. Proof: its self-test (8 cases), and a mutation on the real list (removing `operator-overview.spec.js`) is caught.
