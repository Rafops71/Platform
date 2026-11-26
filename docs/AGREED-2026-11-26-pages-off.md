# The GitHub Pages copy is switched off; the platform is published to Cloudflare Pages only

Decided by the owner on 26 Nov 2026 (relayed by Supervisor 2: "the owner chose to switch that copy off"). The old copy at
rafops71.github.io kept failing its publish step on a short listing delay after upload (the supervisor's reading of run
45714498853), and members have used app.myplatform.trade since 29 Oct 2026. Job carried out by Builder 3; the supervisor proves
the password-reset link on the app address before this is merged and switches the repository's Pages setting off after it.

## What changes in the repository
- `ci.yml`: the `deploy` job (GitHub Pages: `pages: write`, environment `github-pages`, `upload-pages-artifact`,
  `deploy-pages`) is removed. `deploy-cloudflare` (the app) and `deploy-www` (the front page) stay, with the same gate: they need
  `database`, `checklist`, `safari`, `package`, are limited to main, and never use a status function.
- `scripts/check-deploy-gate.js` no longer looks for a `deploy` job and now fails the build if ANY workflow contains a
  `deploy-pages` step (before: exactly one, in `deploy`). `scripts/test-deploy-gate.js`: the cases moved to the Cloudflare job, and a
  new case puts a GitHub Pages `deploy` back into `ci.yml` and requires a failure (13 cases).
- The last references to the old address move to `https://app.myplatform.trade/`: the default reset URL in
  `tests/e2e/password-reset.spec.js` (used only when no deployed address is given), and the fallback default and a comment in
  `supabase/functions/operator-recovery-link/index.ts`. **The function is NOT redeployed by this change**: the live secret
  already points to the app address, so the live function is correct either way; whether to redeploy is the supervisor's decision.
- Comments and documents: `scripts/morning-report.js`, `scripts/assemble-site.sh`, `tests/e2e/helpers/session.js`, `README.md`
  (the "GitHub Pages" setup step now says where the site is published), `HANDOFF.md` (the 13 Oct passage is kept as history with a
  note; the gate paragraph names the publishing jobs). No date for the switch-off is written down: the supervisor gives it.

## Not changed
`sql/017_lock_down_function_access.sql` (an applied migration; its comment names the old address and stays as history),
`myplatform_platform_ai_review.md` (a review document), `demo-pages.yml` and `operator-demo-pages.yml` (they use
`upload-pages-artifact` for their own Cloudflare demo builds, not GitHub Pages).
