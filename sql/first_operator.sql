-- ============================================================================
-- Jericho Platform — Promote the first Operator account
--
-- Why this exists: every self-registration always lands as
-- role='participant', status='pending' (enforced in rls_policies.sql,
-- handle_new_user()). There is deliberately no way to become an Operator
-- through the app. So bootstrapping the very first Operator is a manual,
-- one-time step:
--
--   1. Go to the deployed Jericho Platform and register normally
--      (register.html) using the Operator's real email — for Rafael, that's
--      rafael.e@telenet.be. This creates a 'pending' participant profile.
--   2. In the Supabase SQL Editor, run the statement below (it runs as the
--      Postgres superuser, which bypasses RLS, so it's the only place this
--      is allowed to happen).
--   3. Repeat steps 1-2 for Rodrigo once his email is known.
-- ============================================================================

update public.profiles
set role = 'operator', status = 'approved'
where email = lower('rafael.e@telenet.be');

-- Verify it took effect:
select id, first_name, last_name, email, role, status from public.profiles
where email = lower('rafael.e@telenet.be');
