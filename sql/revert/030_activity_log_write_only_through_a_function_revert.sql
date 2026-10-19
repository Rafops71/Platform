-- Revert 030: give the activity log its direct INSERT route back.
--
-- Restores exactly what sql/rls_policies.sql:688-690 and :740 create, which
-- is where these two statements were copied from - not reconstructed from
-- memory of what they probably said.
--
-- record_activity() is dropped last. Anything already calling it (js/auth.js,
-- js/operator.js) falls back to nothing: those call sites are wrapped in a
-- try/catch that treats a failed log as non-fatal, so reverting the database
-- without reverting the application loses log lines but breaks no screen.

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert
  with check (user_id = public.current_profile_id() or public.is_operator());

grant select, insert on public.activity_log to authenticated;

drop function if exists public.record_activity(text, jsonb);
