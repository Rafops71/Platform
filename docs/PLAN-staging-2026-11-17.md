# Plan: pull-request browser tests on staging (written 17 Nov 2026, NOTHING IN THIS FILE HAS BEEN RUN)

Status: **postponed.** PR #117 tried the switch and went red (run 43980820131, head 8aed1a5, branch
`staging-pr-tests-2026-11-16`). Staging passed 84 of 88 functions; the other four, and a grid failure,
trace to the four gaps below. This file is the plan for closing them. Every step that changes staging
needs the owner's approval first (docs/AGREED-2026-11-16-tooling.md, item 5). Nothing here touches live data.

## What failed, and why (from the logs of that run)
| Gap | Evidence | Fix |
|---|---|---|
| A. Staging has no approved Operator | `select role, status, count(*) from public.profiles` on staging: no rows (live: 1 approved Operator). `tests/e2e/helpers/fixtures.js` writes each fixture invitation as "the first approved Operator" and throws "No approved Operator exists to write fixture invitations" when there is none. Items 54, 57, 77 failed on it; 23 was skipped behind a failed serial spec. | Step 1 |
| B. A test sent the live key to staging | `password-reset.spec.js` read the publishable key from `js/supabase-config.js` (live) and sent it to `SUPABASE_URL` (staging): 401 "Invalid API key". | Done in the PR that carries this file |
| C. No edge function on staging | `list_edge_functions` on staging: empty. Live has `operator-recovery-link`, ACTIVE, version 1, `verify_jwt` true. Items 54 and 57 call it. | Step 2 |
| D. The grid and the checklist share one staging database | Privilege scan: "invitations changed from 5 to 6". It counts the whole invitations table before and after its attempts (`scripts/privilege-scan.js` lines 64 and 115); the checklist wrote a fixture invitation inside that window. | Step 3 |

## Step 1. A standing Operator on staging (needs the owner's yes)
Purpose: be the "first approved Operator" the fixtures name as inviter. It never signs in.
- **Do not** give it the prefix `myplatform-e2e-` or `jericho-e2e-`: the fixtures' cleanup deletes those. Use
  `staging-operator@example.invalid` (never routable; the receipt and notification rules already skip `@example.invalid`).
- **Precondition (read-only):** `select count(*) from public.profiles` on staging must be 0 (the first account on an empty
  database needs no invitation, `handle_new_user()`); if it is not 0, stop and re-plan.
- **Create:** the Auth admin call the fixtures already use, `POST {STAGING_URL}/auth/v1/admin/users` with the service-role
  key, body `{ email, password: <random, never stored>, email_confirm: true, user_metadata: { first_name, last_name, phone, country, language } }`
  (the same shape as `createAccount` in `tests/e2e/helpers/fixtures.js`). The profile is made by `handle_new_user()`.
- **Promote (same statement as `scripts/bootstrap-operator.sh`):**
  `update public.profiles set role = 'operator', status = 'approved' where email = 'staging-operator@example.invalid';`
  then read it back: role operator, status approved.
- **Teardown (proven locally first, see below):** `DELETE {STAGING_URL}/auth/v1/admin/users/{id}` (the call `cleanup()` uses
  for fixtures); the profile goes with the user. The audit-log line the creation wrote stays, by design (the log is write-only).
- **Proof run locally on 17 Nov** against the throwaway PostgreSQL (the setup and the teardown, SQL-level, no Supabase Auth):
  0 profiles; insert the auth user: profile created by `handle_new_user()`; promote: operator/approved; the fixtures' inviter
  query returns a row; delete the auth user: 0 profiles left; 0 notifications left; 1 activity-log row remains. The Auth admin
  HTTP calls themselves are NOT proven here (they need the staging service key).
- Cost to watch: every fixture listing notifies each Operator, including this one; `cleanup()` already removes those notifications
  (that is what it was written for after the 4,776-entry incident), so they should not accumulate. Check the count after the first run.

**Built (PR for 17 Nov):** `scripts/staging-operator.js` (`status` / `create` / `teardown`) and the manual workflow
`.github/workflows/staging-operator.yml` (workflow_dispatch only; staging secrets only; the script refuses any address that is not
staging's). `node scripts/staging-operator.js --self-test` proves create, idempotence, teardown, the refusals and the workflow's
secrets against a throwaway PostgreSQL with a local stand-in for the Auth admin API (15 checks). The real Auth HTTP calls are first
exercised when the workflow is dispatched.

## Step 2. Deploy `operator-recovery-link` to staging (needs the owner's yes)
- **Source:** `supabase/functions/operator-recovery-link/index.ts` from the repository, `verify_jwt: true` (as on live). I read the
  live copy on 17 Nov and it matches the repository file in structure (same header, same checks, same `log_activity` call);
  I did not byte-compare them.
- **How:** the Supabase tool `deploy_edge_function` (project = staging, name `operator-recovery-link`, entrypoint `index.ts`,
  `verify_jwt` true, one file). The CLI route (`supabase functions deploy`) I have NOT verified from current documentation here.
- **Secrets it needs:** none to set. The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase's
  documentation (read 17 Nov, "Environment variables" page, "Default secrets") lists as available to every Edge Function.
  `SITE_RESET_URL` is optional; unset it falls back to the live site's reset page.
- **Not yet checked, and could still fail Items 54 and 57:** the staging project's Auth redirect allow-list. The test's own comment says
  the live project's list has one entry and the test had to follow it. It cannot be read with SQL; it needs the Dashboard or the
  Management API. Check before deploying, and report what it holds.
- **Teardown:** delete the function in the Dashboard (Edge Functions). I have no delete tool for it here and have not verified the
  menu, so ask for a screenshot rather than describe a click path.

## Step 3. Make the grid and the checklist take turns on staging
The privilege scan must see no other writer: weakening it (counting fewer rows) is not an option. Two workflows in one concurrency
group cancel each other's waiting runs (PR 38), which is why #117 used separate groups and collided. The structurally safe fix:
one workflow, jobs in a chain. **Recommendation:** in a pull request, run `ci.yml`'s staging checklist first and the security grid
after it in the same workflow (`needs:`), and keep `security-grid.yml` for the nightly schedule and manual runs only (a nightly
overlapping a pull request is rare; give the nightly the same group name as the PR chain so GitHub queues it). Alternatives: put the
checklist as a job in `security-grid.yml` (that workflow has a path filter, so docs-only pull requests would skip the checklist: worse).

## Step 4. Re-apply the switch and the guard
From branch `staging-pr-tests-2026-11-16` (commit 8aed1a5): the `TARGET_*` blocks, the PR-only staging bring-up step, the
group, `scripts/check-ci-targets.js` and its self-test (six deliberate breaks, all caught). Rework the group for Step 3.

## Acceptance before merging that PR
1. The checklist on staging proves 88 of 88, **twice in a row**, with the grid green after it in the same run.
2. `scripts/check-ci-targets.js --self-test` green; `check:deploy` green; a push to main still resolves to live.
3. Say in the PR what the staging Operator and the function cost to keep, and how to remove them.

## Open items for the owner (not done)
- Drop the leftover live policy `activity_log_insert` (inert today; migration 030 drops it, a later full apply of `rls_policies.sql` re-created it).
- The staging ledger records file names, not contents (how the receipt-trigger drift went unseen). A content hash per row would catch it.
