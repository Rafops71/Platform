-- Revert of sql/071: puts back what live had before it, the policy and anon's INSERT privilege.
-- (authenticated's INSERT privilege was revoked by 030 and stays revoked; this does not undo 030.)
-- The policy is the one sql/rls_policies.sql used to create. No member's data is involved. Safe to run twice.
begin;
drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert
  with check (user_id = public.current_profile_id() or public.is_operator());
grant insert on public.activity_log to anon;
commit;
