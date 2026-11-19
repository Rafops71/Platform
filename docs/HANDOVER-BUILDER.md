# HANDOVER FOR THE BUILDER. Technical only. Update only when something meaningful changes.
Last updated: 17 Nov 2026 by Supervisor 2 (handover Builder 2 -> Builder 3). Next migration number: 068 (sql/NEXT). Longer history: docs/SUPERVISOR-STATE-2026-11-08.md.

## 1. Architecture and current state
- MyPlatform (repo Rafops71/Platform): static HTML/CSS/JS on Cloudflare Pages. Supabase LIVE coarclhafggkakmpggfh; STAGING pqxlfgvjoowawzgoszna ("Platform Staging"). Operator = ONE legal party (singular everywhere, never a number or a name). Entity will be UAE; Terms English law, DIFC courts, PLACEHOLDER banner kept.
- Gate: .github/workflows/ci.yml. Pull requests run the Function checklist (88 functions) and Safari on STAGING, then the security grid, then pictures, in one chain; pushes to main and manual runs use LIVE. Guard: scripts/check-ci-targets.js (never let a push resolve to staging or a PR to live; no always()). Migrations: sql/NNN_*.sql + sql/revert + sql/tests; sql/NEXT holds the next number (check:migrations fails on skip/repeat). Every NEW migration carries a header line `-- applied-probe: select ...` (read-only, true once live); CI checks it read-only on live. Live is applied ONLY via apply-sql.yml (workflow_dispatch, input files, ref = branch) by the supervisor. Live is now up to 067 (staging up to 067 through the grid's --only-new).
- Staging now has: 1 standing Operator staging-operator@example.invalid (workflow staging-operator: status/create/teardown) and the edge function operator-recovery-link (v1, verify_jwt true; delete only via dashboard). Its redirect list holds the live reset.html plus two localhost entries (left alone).
- You report to the supervisor session by send_message (to the session id you are given). You never merge or apply live. Spanish wording is yours to write and verify (formal style); member-visible English wording only from a brief or a decisions file.

## 2. Rules (docs/RULES-OF-THE-ROAD.md = Fable's 12, word for word; CLAUDE.md points to it)
- NEW rule 13 (owner, 17 Nov; goes into RULES-OF-THE-ROAD.md with the next normal PR, not alone): "Before any switch, setup or migration: list every precondition it needs and CHECK each one exists with a tool. Only then build."
- ONE attempt per job: run `npm run prepush` and write the precondition list (each item CHECKED with a tool) BEFORE pushing; paste both in the PR. A PR abandoned is reported to the owner as a failure.
- No more tooling/infrastructure work unless something is broken. Back to the product.
- Every PR names what it serves (docs/AGREED-....md or an item); scripts/check-pr-purpose.js fails otherwise.
- Never weaken or skip a test. When a test fails say whether the test or the app is wrong.

## 3. Completed and live (all checks green)
#102 sign-in line; #103 daily purge (061); #108 Operator singular + SOP paragraph + introduction rule; #109 HMS rename (062); #110 no "serious"; #111 document questions (063); #112 dated statements (064); #113 Terms 3.8 (065); #114 readiness ticks (066, Operator-only visibility, Item 66); #116 tooling (Fable #1 #2 #3 #4 #6); #118 (067 staging email rule + test-key fix); #119 staging-operator workflow; #120 PR tests on staging.

## 4. Outstanding
- JOB: "Please reconcile" (Operator button next to "Ask member to rewrite", mirrors item 78). Mockup APPROVED by the owner 17 Nov (branch mockup-reconcile-2026-11-17, commit fa024c6; mockups/reconcile/, docs/PRECONDITIONS-reconcile-2026-11-17.md on that branch). Owner answers: (1) member answers with normal Reply; Operator forwards/ignores by hand; nothing automatic. (2) Spanish text too (builder writes it; Operator console stays English). (3) date = existing last-confirmed date truth_confirmed_at, no per-sentence dates. (4) the Operator picks ONE of the sender's ticked/earlier statements; button shows ONLY if the sender has at least one earlier statement. (5) labels kept: box heading "What this member stated earlier, on their own listing"; status "On hold". (6) the member's message: "On <last-confirmed date> you confirmed '<statement>'. Your message of <date> says '<message text>'. Please tell the Operator which is correct, or change your statement." (rest word for word from his example; nothing judged, no account closed; the message is NOT forwarded until the member answers). (7) the Operator ALSO sees the sender's real name in the box (Operator only; never in anything a member sees or in the text sent to the member; test it).
  Build needs (from the precondition list): new additive messages.status value (on_hold) via migration 068 (+ applied-probe, revert, sql test, EN+ES labels); record_activity allow-list needs the new action name (recreate from live's list at build time); item 78's reply/forward-log/notification/activity steps are reusable; no checklist row for reconcile (PR names Item 78 and says so, or adds an item with a test). Not yet checked: what the member's Mailbox renders for an on_hold message. State of Builder 2's work on branch reconcile-2026-11-17: see the handover message from Builder 2 / `git log origin/reconcile-2026-11-17`.
- Function-by-function walkthrough with the owner (build only after, in one batch).
- Open for the owner: drop the leftover live policy activity_log_insert (inert; needs his yes); staging ledger has no content hash.
- Parked: SOP wording, checklist items 66/68 wording (Item 66 text still says "both document answers"), 3.8 change-summary wording, Terms s.10 p4 plural verb, application-review clause, sanctions name check, UAE licence facts, info@ mailbox, T8/T11/T12, films, code protection, OpenCode trial.

## 5. Known gotchas (learned the hard way)
- A red Function checklist right after a new migration = migration not applied yet (supervisor applies via apply-sql, then rerun failed jobs). The #116 "applied live?" step now says so in seconds.
- Staging runs fail when the grid and the checklist write at once: they are chained in ci.yml; do not add a second writer.
- Hidden-element assertions: a `not.toContainText` on `main` includes hidden forms; target the screen (#screen-browse etc.). A static lint (scripts/check-test-hidden.js) now guards the common case.
- The pictures job needs the STAGING_ env; tests/visual operator tests need SUPABASE_URL/ANON/SERVICE.
- Force-push is denied in auto mode: use a new branch, never rewrite a pushed one. Commit trailers: use the session link you are given, no typos.
- The second-opinion review is an opinion; check each claim against the code, act on what survives, report acted/not acted.
- Context ~1M but cost grows: start a fresh builder from this file at ~60%.

## 6. Paths
docs/SUPERVISOR-STATE-2026-11-08.md, docs/IDEAS-2026-11-12.md (branch claude/great-allen-5xl0gm), docs/FABLE-ORCHESTRATION-2026-11-16.md (branch fable-review), docs/RULES-OF-THE-ROAD.md, docs/AGREED-2026-11-16-tooling.md, docs/PLAN-staging-2026-11-17.md, sql/, js/i18n.js, js/app.js, js/operator.js, scripts/, tests/e2e, tests/visual, terms/changes/.

## 7. Tests
All checks green on every merged PR (#102-#120). Function checklist 88 of 88 on staging twice in a row at #120.
