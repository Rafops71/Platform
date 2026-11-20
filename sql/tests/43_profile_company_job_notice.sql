-- 43_profile_company_job_notice.sql
--
-- Proves sql/072 and its revert (the Operator is told when a member changes company or job title; owner, 19 Nov 2026,
-- batch 2 point 5):
--   * changing the company, or the job title, writes its own entry carrying the old and the new value, filed against the
--     member who changed it, and nothing is blocked (the change itself goes through);
--   * a change to anything else, and a save that changes nothing, writes no such entry;
--   * the entry is the Operator's alone: a member cannot read the log, another member cannot, and the member's own
--     activity export does not list it;
--   * the old 'profile_updated' entry still names fields only and never carries a value;
--   * the revert puts back sql/011's function exactly; re-applying gives exactly what 072 first produced.
-- Ends with 072 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE OPERATOR IS TOLD OF A COMPANY OR JOB TITLE CHANGE ==========='

select public.test_invite('pcn-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('43430000-0043-4343-8343-00000000000a'::uuid, 'pcn-a@example.invalid',
        jsonb_build_object('first_name', 'Nora', 'last_name', 'Notice', 'company', 'Old Metals SA'));
select public.test_invite('pcn-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('43430000-0043-4343-8343-00000000000b'::uuid, 'pcn-b@example.invalid',
        jsonb_build_object('first_name', 'Bert', 'last_name', 'Bystander'));
select public.test_invite('pcn-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('43430000-0043-4343-8343-00000000000c'::uuid, 'pcn-op@example.invalid',
        jsonb_build_object('first_name', 'Opal', 'last_name', 'Operator'));

update public.profiles set status = 'approved' where user_id in
  ('43430000-0043-4343-8343-00000000000a'::uuid, '43430000-0043-4343-8343-00000000000b'::uuid);
update public.profiles set role = 'operator', status = 'approved' where user_id = '43430000-0043-4343-8343-00000000000c'::uuid;

-- A starting point of known values (done as the owner of the table, with no identity, so it is not the change under test).
update public.profiles set company = 'Old Metals SA', job_title = 'Trader' where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;
create temp table t43_mark as select now() as t;
grant select on t43_mark to authenticated;
select pg_sleep(0.05);

create temp table t43_before as
  select pg_get_functiondef('public.trg_log_profile_change()'::regprocedure) as f;

-- ---- the member changes company and job title ----
set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000a';
update public.profiles set company = 'New Metals GmbH', job_title = 'Head of Trading'
 where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;
reset role; reset "test.uid";

select case when count(*) = 1 and bool_and(a.details ->> 'from' = 'Old Metals SA' and a.details ->> 'to' = 'New Metals GmbH')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 a company change writes one entry with the old and the new company, filed against the member"
from public.activity_log a join public.profiles p on p.id = a.user_id
where a.action = 'profile_company_changed' and p.user_id = '43430000-0043-4343-8343-00000000000a'::uuid
  and a.created_at >= (select t from t43_mark);

select case when count(*) = 1 and bool_and(a.details ->> 'from' = 'Trader' and a.details ->> 'to' = 'Head of Trading')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 a job title change writes one entry with the old and the new title"
from public.activity_log a join public.profiles p on p.id = a.user_id
where a.action = 'profile_job_title_changed' and p.user_id = '43430000-0043-4343-8343-00000000000a'::uuid
  and a.created_at >= (select t from t43_mark);

select case when company = 'New Metals GmbH' and job_title = 'Head of Trading' then 'PASS' else 'FAIL' end
  as "T3 nothing is blocked: the change itself went through"
from public.profiles where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;

-- ---- what writes no entry ----
set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000a';
update public.profiles set phone = '+32470000043' where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;
update public.profiles set company = company, job_title = job_title where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;
reset role; reset "test.uid";

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 changing the phone, or saving without a change, writes no company or job title entry (still the two from T1 and T2)"
from public.activity_log a join public.profiles p on p.id = a.user_id
where a.action in ('profile_company_changed', 'profile_job_title_changed')
  and p.user_id = '43430000-0043-4343-8343-00000000000a'::uuid and a.created_at >= (select t from t43_mark);

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T5 the phone number is in no log entry (only company and job title ever carry values)"
from public.activity_log where details::text like '%+32470000043%';

-- The old entry still names fields and carries no value.
select case when count(*) >= 1 and bool_and(a.details ->> 'from' is null and a.details ->> 'to' is null and a.details::text not like '%Head of Trading%')
            then 'PASS' else 'FAIL' end
  as "T6 the profile_updated entry still names the fields and carries no value"
from public.activity_log a join public.profiles p on p.id = a.user_id
where a.action = 'profile_updated' and p.user_id = '43430000-0043-4343-8343-00000000000a'::uuid and a.created_at >= (select t from t43_mark);

-- ---- who can see it ----
set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000a';
create temp table t43_own as select action from public.activity_log;
create temp table t43_export as select category, detail from public.my_activity_export();
reset role; reset "test.uid";
select case when (select count(*) from t43_own) = 0 then 'PASS' else 'FAIL the member read ' || (select count(*) from t43_own) end
  as "T7 the member cannot read the activity log, so cannot read the entry about themselves";
select case when not exists (select 1 from t43_export where detail like '%Metals%' or detail like '%Head of Trading%' or detail like '%Trader%')
            then 'PASS' else 'FAIL' end
  as "T8 the member's own activity export does not carry the old or new company or title";

set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000b';
create temp table t43_other as select action from public.activity_log;
reset role; reset "test.uid";
select case when (select count(*) from t43_other) = 0 then 'PASS' else 'FAIL' end
  as "T9 another member cannot read it either";

set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000c';
create temp table t43_op as select action, details from public.activity_log
 where action in ('profile_company_changed', 'profile_job_title_changed') and created_at >= (select t from t43_mark);
reset role; reset "test.uid";
select case when (select count(*) from t43_op) = 2 and exists (select 1 from t43_op where details ->> 'to' = 'New Metals GmbH')
            then 'PASS' else 'FAIL got ' || (select count(*) from t43_op) end
  as "T10 the Operator reads both entries, with old and new values";

-- ---- revert and re-apply ----
\i sql/revert/072_profile_company_job_notice_revert.sql
set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000a';
update public.profiles set company = 'Reverted Co' where user_id = '43430000-0043-4343-8343-00000000000a'::uuid;
reset role; reset "test.uid";
select case when not exists (select 1 from public.activity_log where action = 'profile_company_changed' and details ->> 'to' = 'Reverted Co')
             and pg_get_functiondef('public.trg_log_profile_change()'::regprocedure) not like '%profile_company_changed%'
            then 'PASS' else 'FAIL' end
  as "T11 after the revert a company change writes no company entry (sql/011's function is back)";

\i sql/072_profile_company_job_notice.sql
select case when pg_get_functiondef('public.trg_log_profile_change()'::regprocedure) = (select f from t43_before)
            then 'PASS' else 'FAIL' end
  as "T12 re-applying 072 gives exactly the function it first produced";
\i sql/072_profile_company_job_notice.sql
select case when pg_get_functiondef('public.trg_log_profile_change()'::regprocedure) = (select f from t43_before)
            then 'PASS' else 'FAIL' end
  as "T13 applying 072 a second time changes nothing (idempotent)";

-- A first fill (nothing before) is a change too, and says so.
set role authenticated; set "test.uid" = '43430000-0043-4343-8343-00000000000b';
update public.profiles set job_title = 'Analyst' where user_id = '43430000-0043-4343-8343-00000000000b'::uuid;
reset role; reset "test.uid";
select case when count(*) = 1 and bool_and(a.details -> 'from' = 'null'::jsonb and a.details ->> 'to' = 'Analyst')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T14 a first fill reads from nothing to the new value"
from public.activity_log a join public.profiles p on p.id = a.user_id
where a.action = 'profile_job_title_changed' and p.user_id = '43430000-0043-4343-8343-00000000000b'::uuid;
