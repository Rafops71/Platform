-- ============================================================================
-- Jericho Platform — Promote an Operator account
--
-- Why this exists: every self-registration always lands as
-- role='participant', status='pending' (enforced in rls_policies.sql,
-- handle_new_user()). There is deliberately no way to become an Operator
-- through the app, so the first Operator is promoted manually here.
--
--   1. Register normally through the deployed app (register.html) using the
--      Operator's real email. This creates a 'pending' participant profile.
--   2. Run the statement below in the Supabase SQL Editor.
--   3. Repeat for each additional Operator (Rodrigo), or — once one Operator
--      exists — use the Users page in the app, which can promote directly.
--
-- KNOWN ISSUE, NOW FIXED (needs 002_updates.sql applied):
-- Before 002_updates.sql, this UPDATE appeared to succeed but silently
-- changed nothing. protect_profile_columns() reverted role/status whenever
-- is_operator() was false, and in the SQL Editor there is no end-user
-- session, so auth.uid() is NULL and is_operator() returns false. The
-- workaround was to disable triggers with
-- `set session_replication_role = replica;`. That is no longer necessary:
-- 002_updates.sql exempts privileged database roles (postgres /
-- supabase_admin / service_role) from that trigger, so the plain UPDATE
-- below now works as written. If it still reports 0 rows changed, apply
-- 002_updates.sql first.
-- ============================================================================

update public.profiles
set role = 'operator', status = 'approved'
where email = lower('rafael.e@telenet.be');

-- Verify it actually took effect — check role really reads 'operator'.
select id, first_name, last_name, email, role, status
from public.profiles
where email = lower('rafael.e@telenet.be');
