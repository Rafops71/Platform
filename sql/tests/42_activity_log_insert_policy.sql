-- 42_activity_log_insert_policy.sql
--
-- Proves sql/071 and its revert (the leftover policy activity_log_insert is gone; owner, 19 Nov 2026, batch 2 point 3):
--   * BEFORE 071 (its revert puts back what live had: the policy and anon's INSERT privilege) neither anon nor a signed-in
--     member can write into the log by hand: this is the proof that nothing relied on the policy;
--   * AFTER 071 the policy and both INSERT privileges are gone, the Operator-only SELECT policy is untouched, and still
--     neither anon nor a member can insert;
--   * the log still works through its real doors: record_activity() and the definer triggers;
--   * applying 071 twice changes nothing, and sql/rls_policies.sql no longer creates the policy or the INSERT grant.
-- Ends with 071 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE LEFTOVER activity_log_insert POLICY ==========='

select public.test_invite('alp-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('42420000-0042-4242-8242-00000000000a'::uuid, 'alp-member@example.invalid',
        jsonb_build_object('first_name', 'Pia', 'last_name', 'Policy'));
update public.profiles set status = 'approved' where user_id = '42420000-0042-4242-8242-00000000000a'::uuid;

create temp table t42_result (name text, ok boolean, note text);
grant all on t42_result to anon, authenticated;

-- ---- BEFORE: put back what live had ----
\i sql/revert/071_drop_activity_log_insert_policy_revert.sql

select case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_log_insert')
             and has_table_privilege('anon', 'public.activity_log', 'INSERT')
            then 'PASS' else 'FAIL' end
  as "T1 the revert puts back the policy and anon's INSERT privilege (the state live had before 071)";

set role anon;
do $$
begin
  insert into public.activity_log (user_id, action) values (null, 'forged by anon');
  insert into t42_result values ('T2', false, 'accepted');
exception when others then insert into t42_result values ('T2', true, sqlstate);
end $$;
reset role;
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end
  as "T2 BEFORE 071: a signed-out visitor still cannot write into the log (the policy was inert)" from t42_result where name = 'T2';

set role authenticated; set "test.uid" = '42420000-0042-4242-8242-00000000000a';
do $$
declare v uuid;
begin
  select id into v from public.profiles where user_id = '42420000-0042-4242-8242-00000000000a'::uuid;
  insert into public.activity_log (user_id, action) values (v, 'forged by a member');
  insert into t42_result values ('T3', false, 'accepted');
exception when others then insert into t42_result values ('T3', true, sqlstate);
end $$;
reset role; reset "test.uid";
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end
  as "T3 BEFORE 071: a signed-in member still cannot write into the log (no INSERT privilege)" from t42_result where name = 'T3';

-- ---- AFTER ----
\i sql/071_drop_activity_log_insert_policy.sql

select case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_log_insert')
             and not has_table_privilege('anon', 'public.activity_log', 'INSERT')
             and not has_table_privilege('authenticated', 'public.activity_log', 'INSERT')
            then 'PASS' else 'FAIL' end
  as "T4 AFTER 071: the policy is gone and neither anon nor authenticated holds INSERT";

select case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'activity_log') = 1
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log'
                           and policyname = 'activity_log_select' and cmd = 'SELECT' and qual like '%is_operator%')
            then 'PASS' else 'FAIL' end
  as "T5 the only policy left is the Operator-only SELECT policy, untouched";

set role anon;
do $$
begin
  insert into public.activity_log (user_id, action) values (null, 'forged by anon');
  insert into t42_result values ('T6', false, 'accepted');
exception when insufficient_privilege then insert into t42_result values ('T6', true, null);
          when others then insert into t42_result values ('T6', false, sqlstate);
end $$;
reset role;
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end
  as "T6 AFTER 071: a signed-out visitor is refused for want of privilege" from t42_result where name = 'T6';

set role authenticated; set "test.uid" = '42420000-0042-4242-8242-00000000000a';
do $$
declare v uuid;
begin
  select id into v from public.profiles where user_id = '42420000-0042-4242-8242-00000000000a'::uuid;
  insert into public.activity_log (user_id, action) values (v, 'forged by a member');
  insert into t42_result values ('T7', false, 'accepted');
exception when insufficient_privilege then insert into t42_result values ('T7', true, null);
          when others then insert into t42_result values ('T7', false, sqlstate);
end $$;
reset role; reset "test.uid";
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end
  as "T7 AFTER 071: a signed-in member is refused for want of privilege" from t42_result where name = 'T7';

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) || ' forged lines' end
  as "T8 no forged line landed in the log, before or after"
from public.activity_log where action in ('forged by anon', 'forged by a member');

-- ---- the log still works through its real doors ----
set "test.uid" = '42420000-0042-4242-8242-00000000000a';
select public.record_activity('login');
reset "test.uid";
select case when exists (select 1 from public.activity_log a join public.profiles p on p.id = a.user_id
                          where p.user_id = '42420000-0042-4242-8242-00000000000a'::uuid and a.action = 'login')
            then 'PASS' else 'FAIL' end
  as "T9 record_activity() still writes the member's own line";

update public.profiles set job_title = 'Door check' where user_id = '42420000-0042-4242-8242-00000000000a'::uuid;
select case when exists (select 1 from public.activity_log a join public.profiles p on p.id = a.user_id
                          where p.user_id = '42420000-0042-4242-8242-00000000000a'::uuid and a.action = 'profile_updated')
            then 'PASS' else 'FAIL' end
  as "T10 the definer triggers still write (a profile edit is logged)";

-- ---- idempotent, and the base file no longer brings it back ----
\i sql/071_drop_activity_log_insert_policy.sql
select case when not exists (select 1 from pg_policies where policyname = 'activity_log_insert')
             and not has_table_privilege('anon', 'public.activity_log', 'INSERT')
            then 'PASS' else 'FAIL' end
  as "T11 applying 071 a second time changes nothing (idempotent)";

\i sql/rls_policies.sql
select case when not exists (select 1 from pg_policies where policyname = 'activity_log_insert')
             and not has_table_privilege('authenticated', 'public.activity_log', 'INSERT')
             and has_table_privilege('authenticated', 'public.activity_log', 'SELECT')
            then 'PASS' else 'FAIL' end
  as "T12 re-running sql/rls_policies.sql does not bring the policy or the INSERT grant back";

-- The revert is proved above (T1 to T3 ran after it); leave 071 applied.
\i sql/071_drop_activity_log_insert_policy.sql
