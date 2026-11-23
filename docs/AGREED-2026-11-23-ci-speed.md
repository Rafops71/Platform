# AGREED 23 Nov 2026: CI speed (owner approved the roadmap and this job on 23 Nov; BATCH GO)
Source: `docs/ROADMAP-2026-11-22.md` section 0.6 and `docs/CI-SPEED-AI-ADVICE-2026-11-22.md` (both on the supervisor's notes branch), relayed by Supervisor 2. Target: a normal run of about 10 minutes instead of about 30.

**The rules this job keeps (supervisor, 23 Nov):** every check stays exactly as strict; no test skipped, weakened or moved out of the gate; `check:deploy` still passes; a push to main still runs everything and still gates publishing; pull requests still run on STAGING and pushes to main on LIVE.

**What this pull request does (steps 1 and 2 of 0.6):**
1. Stop double waiting. The Playwright browser download is cached in every job that installs a browser (npm was already cached in every job). A new workflow, `.github/workflows/cancel-superseded.yml`, cancels the older CI runs of the SAME pull request when a new commit arrives. It cannot be done with `cancel-in-progress` in `ci.yml`, because that group is shared by every pull request on purpose (staging has one writer). It never touches runs on main or manual runs.
2. A pull request that changes only documents (`docs/**` except `docs/CHECKLIST.md`, `mockups/**`, Markdown files in the repository root) skips the browser chain (Function checklist, Safari, the grid, the pictures). Everything else, wording in `js/i18n.js` included, runs it, because a label change can break a browser assertion that only that suite sees. A push to main and a manual run always run everything. The database tests and the offline checks always run.

**What it does NOT do, and why:** steps 3 and 4 (each test makes and cleans its own data, then parallel workers) are the large saving and the large risk, and are separate pull requests that need the supervisor's go. Step 5 (a short live smoke after merge instead of the full rerun; Safari and the load test nightly) is the owner's choice, later, by button, because it changes the gate.
