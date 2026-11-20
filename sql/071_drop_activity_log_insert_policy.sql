-- 071: drop the leftover policy activity_log_insert (owner said yes, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 3).
-- applied-probe: select not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_log_insert') and not has_table_privilege('anon', 'public.activity_log', 'INSERT')
--
-- WHY THE POLICY IS LEFTOVER. Migration 030 closed the direct way into the activity log (a member could write a line by
-- hand): it added record_activity(), dropped this policy and revoked INSERT from authenticated. But sql/rls_policies.sql,
-- which a full re-apply runs first, created the policy again, and live has it. It is inert: the signed-in role has no INSERT
-- privilege on the table, and for the signed-out role (anon) the policy's check (the caller's own profile, or an Operator)
-- cannot pass. Nothing relies on it: the log is written by record_activity() and by SECURITY DEFINER triggers, which are
-- not subject to this policy.
--
-- WHAT THIS DOES (it only removes a door that was already shut; no row changes):
--   1. drops the policy, if it exists;
--   2. revokes INSERT on the table from anon and authenticated (anon still held it on live; revoking what is not held is
--      harmless, so this is safe to run twice).
-- The SELECT policy (Operator only) and every other grant are untouched, and so are the wider UPDATE/DELETE/TRUNCATE
-- grants (RLS with no policy blocks them through the API); that question is the supervisor's, not this migration's.
-- sql/rls_policies.sql no longer creates the policy or the INSERT grant, so a full re-apply cannot bring it back.
drop policy if exists activity_log_insert on public.activity_log;
revoke insert on public.activity_log from anon, authenticated;
