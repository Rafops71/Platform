-- 45_activity_log_tidy.sql
--
-- Proves sql/074 and its revert: anon and authenticated lose UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES on the
-- activity log and keep SELECT; the Operator-only read policy is untouched; every writer (all SECURITY DEFINER) still works.
--   * BEFORE (the revert puts back what live held): the five privileges are there;
--   * AFTER: they are gone for both roles, SELECT stays, service_role keeps everything it had;
--   * a signed-in member's UPDATE, DELETE and TRUNCATE are refused for want of privilege (not merely filtered by RLS);
--   * the Operator still reads the log through the policy, a member still sees no rows;
--   * record_activity(), a definer trigger and purge_orphaned_activity() still write and delete;
--   * applying twice changes nothing; re-running sql/rls_policies.sql does not bring the privileges back.
-- Ends with 074 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE ACTIVITY LOG TIDY ==========='

select public.test_invite('alt-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('45450000-0045-4545-8245-00000000000a'::uuid, 'alt-member@example.invalid',
        jsonb_build_object('first_name', 'Tara', 'last_name', 'Tidy'));
update public.profiles set status = 'approved' where user_id = '45450000-0045-4545-8245-00000000000a'::uuid;
select public.test_invite('alt-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('45450000-0045-4545-8245-00000000000b'::uuid, 'alt-op@example.invalid',
        jsonb_build_object('first_name', 'Orla', 'last_name', 'Tidy'));
update public.profiles set role = 'operator', status = 'approved' where user_id = '45450000-0045-4545-8245-00000000000b'::uuid;

create temp table t45_result (name text, ok boolean, note text);
grant all on t45_result to anon, authenticated;

-- ---- BEFORE: put back what live held ----
\i sql/revert/074_activity_log_tidy_revert.sql
select case when (select count(*) from unnest(array['UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) p
                   where has_table_privilege('anon', 'public.activity_log', p) and has_table_privilege('authenticated', 'public.activity_log', p)) = 5
            then 'PASS' else 'FAIL' end
  as "T1 the revert puts back all five privileges for anon and authenticated (the state live had before 074)";

-- service_role's privileges as they are now (the stub does not give it Supabase's defaults, so what is asserted is that 074
-- CHANGES NOTHING about them, whatever they are).
create temp table t45_svc_before as
  select p, has_table_privilege('service_role', 'public.activity_log', p) held
    from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) p;

-- ---- AFTER ----
\i sql/074_activity_log_tidy.sql
select case when (select count(*) from unnest(array['UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) p
                   where has_table_privilege('anon', 'public.activity_log', p) or has_table_privilege('authenticated', 'public.activity_log', p)) = 0
            then 'PASS' else 'FAIL' end
  as "T2 AFTER 074: neither anon nor authenticated holds UPDATE, DELETE, TRUNCATE, TRIGGER or REFERENCES";

select case when has_table_privilege('authenticated', 'public.activity_log', 'SELECT')
             and not has_table_privilege('authenticated', 'public.activity_log', 'INSERT')
             and not has_table_privilege('anon', 'public.activity_log', 'INSERT')
            then 'PASS' else 'FAIL' end
  as "T3 SELECT is kept for authenticated and INSERT stays revoked (030, 071)";

select case when not exists (select 1 from t45_svc_before b where b.held is distinct from has_table_privilege('service_role', 'public.activity_log', b.p))
            then 'PASS' else 'FAIL' end
  as "T4 service_role's privileges on the log are exactly what they were before 074";

select case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'activity_log') = 1
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log'
                           and policyname = 'activity_log_select' and cmd = 'SELECT' and qual like '%is_operator%')
            then 'PASS' else 'FAIL' end
  as "T5 the only policy is still the Operator-only SELECT policy, untouched";

-- A line to try things on, through the front door.
set "test.uid" = '45450000-0045-4545-8245-00000000000a';
select public.record_activity('login');
reset "test.uid";

-- ---- the prohibitions: refused for want of privilege, not merely filtered ----
set role authenticated; set "test.uid" = '45450000-0045-4545-8245-00000000000b';   -- even the Operator, as a signed-in role
do $$
begin
  update public.activity_log set action = 'rewritten';
  insert into t45_result values ('T6', false, 'accepted');
exception when insufficient_privilege then insert into t45_result values ('T6', true, null);
          when others then insert into t45_result values ('T6', false, sqlstate);
end $$;
do $$
begin
  delete from public.activity_log;
  insert into t45_result values ('T7', false, 'accepted');
exception when insufficient_privilege then insert into t45_result values ('T7', true, null);
          when others then insert into t45_result values ('T7', false, sqlstate);
end $$;
do $$
begin
  truncate public.activity_log;
  insert into t45_result values ('T8', false, 'accepted');
exception when insufficient_privilege then insert into t45_result values ('T8', true, null);
          when others then insert into t45_result values ('T8', false, sqlstate);
end $$;
reset role; reset "test.uid";
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end as "T6 AFTER 074: an UPDATE of the log by a signed-in account is refused for want of privilege" from t45_result where name = 'T6';
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end as "T7 AFTER 074: a DELETE from the log by a signed-in account is refused for want of privilege" from t45_result where name = 'T7';
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end as "T8 AFTER 074: a TRUNCATE of the log by a signed-in account is refused for want of privilege" from t45_result where name = 'T8';

set role anon;
do $$
begin
  delete from public.activity_log;
  insert into t45_result values ('T9', false, 'accepted');
exception when insufficient_privilege then insert into t45_result values ('T9', true, null);
          when others then insert into t45_result values ('T9', false, sqlstate);
end $$;
reset role;
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end as "T9 AFTER 074: a signed-out visitor's DELETE from the log is refused for want of privilege" from t45_result where name = 'T9';

select case when exists (select 1 from public.activity_log where action = 'login')
             and not exists (select 1 from public.activity_log where action = 'rewritten')
            then 'PASS' else 'FAIL' end
  as "T10 the log still holds the line written before, and nothing was rewritten";

-- ---- reading is unchanged: the Operator reads, a member sees nothing ----
set role authenticated; set "test.uid" = '45450000-0045-4545-8245-00000000000b';
create temp table t45_op as select count(*)::int n from public.activity_log;
reset role; reset "test.uid";
set role authenticated; set "test.uid" = '45450000-0045-4545-8245-00000000000a';
create temp table t45_mem as select count(*)::int n from public.activity_log;
reset role; reset "test.uid";
select case when (select n from t45_op) > 0 and (select n from t45_mem) = 0 then 'PASS'
            else 'FAIL op=' || (select n from t45_op) || ' member=' || (select n from t45_mem) end
  as "T11 the Operator still reads the log through the policy and a member still sees no rows";

-- ---- every writer still works (all SECURITY DEFINER) ----
set "test.uid" = '45450000-0045-4545-8245-00000000000a';
select public.record_activity('login', jsonb_build_object('second', true));
reset "test.uid";
select case when exists (select 1 from public.activity_log a join public.profiles p on p.id = a.user_id
                          where p.user_id = '45450000-0045-4545-8245-00000000000a'::uuid and a.action = 'login' and a.details ? 'second')
            then 'PASS' else 'FAIL' end
  as "T12 record_activity() still writes the member's own line";

update public.profiles set job_title = 'Tidy check' where user_id = '45450000-0045-4545-8245-00000000000a'::uuid;
select case when exists (select 1 from public.activity_log a join public.profiles p on p.id = a.user_id
                          where p.user_id = '45450000-0045-4545-8245-00000000000a'::uuid and a.action = 'profile_updated')
            then 'PASS' else 'FAIL' end
  as "T13 a definer trigger still writes (a profile edit is logged)";

-- A line about something that does not exist, then the purge, called as the Operator exactly as the console does.
insert into public.activity_log (user_id, action, details)
values (null, 'listing_created', jsonb_build_object('listing_id', '45450000-0045-4545-8245-0000000000ff'));
set role authenticated; set "test.uid" = '45450000-0045-4545-8245-00000000000b';
create temp table t45_purge as select public.purge_orphaned_activity() as removed;
reset role; reset "test.uid";
select case when (select removed from t45_purge) >= 1
             and not exists (select 1 from public.activity_log where details->>'listing_id' = '45450000-0045-4545-8245-0000000000ff')
            then 'PASS' else 'FAIL removed=' || (select removed from t45_purge) end
  as "T14 purge_orphaned_activity() still deletes, called as the Operator";

-- ---- idempotent, and the base file does not bring it back ----
\i sql/074_activity_log_tidy.sql
select case when not has_table_privilege('authenticated', 'public.activity_log', 'DELETE')
             and has_table_privilege('authenticated', 'public.activity_log', 'SELECT')
            then 'PASS' else 'FAIL' end
  as "T15 applying 074 a second time changes nothing (idempotent)";

\i sql/rls_policies.sql
select case when not has_table_privilege('authenticated', 'public.activity_log', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.activity_log', 'TRUNCATE')
             and not has_table_privilege('anon', 'public.activity_log', 'TRIGGER')
            then 'PASS' else 'FAIL' end
  as "T16 re-running sql/rls_policies.sql does not give the privileges back";

\i sql/074_activity_log_tidy.sql
