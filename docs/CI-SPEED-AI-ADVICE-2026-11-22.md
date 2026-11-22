# CI speed: what Grok, ChatGPT and Mistral advised (22 Nov 2026), distilled by Opus
Input for the CI-speed job. Nothing here is decided; the owner chose "all four" (batches, skip heavy checks for word-only changes, parallel checks, staging=live behaviour).

All three agree:
- Parallel Playwright is the big win, BUT only after each test makes and cleans its own data (per-worker unique ids via testInfo.workerIndex). Sharding alone, on one shared database, makes failures worse (ChatGPT, Grok). Go in steps: 2 workers, then 4, measure (ChatGPT).
- Skip heavy suites by changed files (dorny/paths-filter or paths-ignore) but keep ONE always-running required job, else a skipped required check stays pending and blocks merge (Grok, ChatGPT).
- Cancel superseded runs (concurrency cancel-in-progress) and cache Playwright browsers/npm.
- Supabase Branching = Pro plan, not free (all three).
- GitHub merge queue = only public repos owned by an ORGANISATION (ours is a personal account; would need a transfer to a free org) (Mistral, Grok). ChatGPT: not a priority.
Two of three:
- After merge, run a short read-only live smoke test instead of the full suite again (ChatGPT, Mistral) - owner's choice: it changes the gate.
- Move Safari, load test, security grid, AI review to nightly/before release (Mistral; ChatGPT nightly full suite) - owner's choice: it changes the gate.
One AI only:
- ChatGPT: test against a LOCAL Supabase started in CI (clean database every run) instead of the shared staging; investigate the 7 post-merge failures one by one first; Trunk has a free tier for flaky tests (unverified by Opus).
- Mistral: agent must run affected tests locally before opening a PR; Neon free branch-per-PR (needs leaving Supabase - not advised); Playwright --only-changed.
- Grok: supabase db diff in CI to catch staging/live schema drift.
Opus notes: ci.yml already has a concurrency block (line 27, not checked what it cancels). Paid tools (Currents $49, BuildPulse $119) not needed.
