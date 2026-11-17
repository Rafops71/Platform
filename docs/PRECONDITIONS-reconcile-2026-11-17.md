# "Please reconcile": every precondition, each CHECKED with a tool (17 Nov 2026; owner's rule 13)

"Live" = read-only SELECTs on the live project (coarclhafggkakmpggfh). "Code" = read in the repository at the commit of this pull request.

| # | The change needs | Checked with | Result |
|---|---|---|---|
| 1 | The dated statement lives somewhere | Live `information_schema.columns` | `listings.readiness` (066), `listings.truth_confirmed_at`, `poster_role`, `principal_kind` exist. |
| 2 | One date per listing, not per sentence | Live: tables like `%statement%` / `%history%` | None (`deal_history` is about deals). The owner accepted this (answer 3): the date is the last-confirmed date. |
| 3 | The Operator can read the sender's listings | Live `pg_policies` | `listings_select` = own rows OR `is_operator()`. |
| 4 | The Operator can read the sender's language | Code: `profiles.language` is used by the e-mail and language code; the Operator's `profiles_select` policy is Operator-wide (staging comparison, 16 Nov: identical policies) | Read in the new code with `select('language')`; proven by the Spanish test. |
| 5 | A message status for "on hold" | Live `pg_get_constraintdef(messages_status_check)` | Allowed: `pending_review, forwarded, replied, ignored, denied`. 068 adds `on_hold` (additive; revert returns on-hold rows to `pending_review`). |
| 6 | An activity-log action name | Live `pg_get_functiondef('public.record_activity')` | Allow-list holds 13 names including `message_rewrite_requested`; its text equals sql/051's body, which 068 re-creates plus `message_reconcile_requested`. `activity_log.action` has no CHECK (Code: schema.sql line 183). |
| 7 | Only an Operator can change a message's status | Code `rls_policies.sql` line 664; proven again in `sql/tests/39_message_on_hold.sql` T2 | `messages_update` is Operator-only. |
| 8 | Reply / forward-log / notification path | Code `js/operator.js` `askMemberToRewriteNow`; test `tests/e2e/item78-forward-edit.spec.js` | The new function copies the same steps and the same tables. |
| 9 | What the member's Mailbox shows for an `on_hold` message (the item I could not check on the mockup) | Code `js/app.js` line 920 and 940: the Mailbox reads `messages` with `.neq('status','denied')` and prints `statusLabel(m.status)` as the badge; `js/utils.js statusLabel` uses `t('status.on_hold')` first | Before this change the badge would have been the raw word "on_hold". Fixed here: `status.on_hold` added in `js/i18n.js` (EN "On hold", ES "En espera") and `STATUS_LABELS` (Operator page). The member sees their own message with that badge; the Operator's reply is an ordinary received message. Proven by the last test in `item78-reconcile.spec.js`. |
| 10 | The Operator's mailbox keeps the buttons on an `on_hold` row | Code `js/operator.js` row template | Changed from `pending_review` only to `pending_review` or `on_hold`; the existing test for a denied row (no buttons) is unaffected. |
| 11 | Existing stale-render, double-press, client, call, error and i18n rules | `npm run check:guards`, `check:double`, `check:client`, `check:calls`, `check:errors`, `check:i18n` on this branch | All pass (output in the pull request). `loadReconcileOptions` uses `renderToken`; the new button is wrapped in `withButtonBusy`. |
| 12 | The Operator demo's mock database has the calls the new code makes | Code `js/demo/mock-supabase.js` (no `.not()`), `npm run test:demo:operator` | The code uses only `select/eq/order/maybeSingle`; the Operator demo suite passes (4 of 4). |
| 13 | Migration number and rules | `sql/NEXT` | 068 reserved with `npm run migration:next -- reserve message_on_hold` (NEXT now 069); applied-probe header present; revert, test file and the three list entries added; `check:migrations` passes. |
| 14 | The migration reaches staging and live in the right order | `.github/workflows/ci.yml` on main (PR #120) | Staging: `apply-sql.js --only-new` in the PR run. Live: the supervisor applies 068 with apply-sql.yml (ref = this branch) BEFORE merge; CI's applied-live step asks the probe and fails with "migration 068 not applied live" if not. |
| 15 | No checklist row | `docs/CHECKLIST.md` | Row 78 exists; there is no row for this idea. A new row is wording that is the owner's call; the tests carry the name `Item78` and the checklist stays unchanged. |
| 16 | Nothing judged / no account touched | Design (owner, 15 Nov); proven by `item78-reconcile.spec.js` test 2 (the sender's whole profile row is identical before and after) | Written, not yet run. |

## Not checkable from here
- That the browser tests pass: they need a real project; the pull request's CI on staging is their first run.
- The look of the new box and buttons in a real browser at phone width (the mockup showed the design; the built page is not screenshotted here).
