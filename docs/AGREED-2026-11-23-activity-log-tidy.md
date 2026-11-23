# Activity log: tidy privileges (23 Nov 2026)

Job 2 of the 23 Nov batch (owner: BATCH GO, 23 Nov; the supervisor's brief). Migration 074.

## What live held (read from `information_schema.role_table_grants`, 23 Nov 2026)
`anon` and `authenticated`: DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. `service_role`: all seven. Row level security with no UPDATE or DELETE policy already
stopped UPDATE and DELETE through the API; TRUNCATE, TRIGGER and REFERENCES are not row-level and RLS does not cover them.

## Decision carried out
Revoke UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES on `public.activity_log` from `anon` and `authenticated`. Kept: SELECT, the Operator-only policy `activity_log_select`,
`service_role`, the owner's privileges. Privileges only: no row, policy or function changes.

## Every writer checked (read from the live database, 23 Nov 2026)
Thirteen functions mention the log; all are SECURITY DEFINER, owned by `postgres`, so they run with the owner's privileges and are not affected: `log_activity`, `record_activity`,
`my_activity_export`, `purge_orphaned_activity`, `renew_listing`, `send_manual_reminder`, `sync_profile_email_from_auth`, `trg_log_checklist_change`, `trg_log_doc_request_change`,
`trg_log_listing_change`, `trg_log_message_forward`, `trg_log_message_insert`, `trg_log_profile_change`. The browser suite's teardown deletes log rows over a direct database
connection (`tests/e2e/helpers/fixtures.js`), not through `anon` or `authenticated`. The Operator console only reads the log (`js/operator.js`, SELECT).

## Proof
`sql/tests/45_activity_log_tidy.sql` (16 assertions): the revert restores live's state; after 074 neither role holds the five privileges, SELECT stays, `service_role` unchanged,
only the Operator-only SELECT policy remains; a signed-in account's UPDATE, DELETE and TRUNCATE and a signed-out DELETE are refused for want of privilege; the Operator still reads
and a member sees nothing; `record_activity()`, a definer trigger and `purge_orphaned_activity()` still work; applying twice and re-running `sql/rls_policies.sql` change nothing.
Revert: `sql/revert/074_activity_log_tidy_revert.sql`. Applied by the supervisor, then the pull request.
