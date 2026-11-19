-- 41_translate_counters.sql
--
-- Proves sql/070 and its revert (counters version 2, after the supervisor's code review of 069):
--   * translate_take_slot returns the hour the press was counted in, and null when the limit is reached;
--   * translate_release_slot gives a press back to EXACTLY that hour (the hour boundary: a press taken in one
--     hour and given back in the next must not touch the new hour);
--   * the sweep of old rows is bounded (20 per call) and never touches fresh rows;
--   * the counters are the service role's alone, and the index exists;
--   * the revert drops the two functions and the index and leaves 069's counters alone; re-applying gives exactly
--     what 070 first produced; applying twice is harmless.
-- Ends with 070 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== TRANSLATE COUNTERS, VERSION 2 ==========='

-- 069's table may have been dropped and re-created by tests/40's revert; bring 070 back first (idempotent).
\i sql/070_translate_counters.sql

select public.test_invite('tc-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('41414141-0041-4141-8141-00000000000a'::uuid, 'tc-a@example.invalid',
        jsonb_build_object('first_name', 'Cora', 'last_name', 'Counter'));

create temp table t41_before as
  select pg_get_functiondef('public.translate_take_slot(uuid,integer)'::regprocedure) as t,
         pg_get_functiondef('public.translate_release_slot(uuid,timestamptz)'::regprocedure) as r;

-- T1: the press is counted in the current hour and the hour comes back; the fourth press in a limit of three is refused.
create temp table t41_h as
  select public.translate_take_slot(id, 3) as h1 from public.profiles where email = 'tc-a@example.invalid';
select case when (select h1 from t41_h) = date_trunc('hour', now()) then 'PASS' else 'FAIL' end
  as "T1 taking a press returns the hour it was counted in";
select public.translate_take_slot(id, 3) from public.profiles where email = 'tc-a@example.invalid';
select public.translate_take_slot(id, 3) from public.profiles where email = 'tc-a@example.invalid';
select case when public.translate_take_slot((select id from public.profiles where email = 'tc-a@example.invalid'), 3) is null
             and (select listings from public.member_translate_usage
                   where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid')
                     and hour_start = date_trunc('hour', now())) = 3
            then 'PASS' else 'FAIL' end
  as "T2 the fourth press in a limit of three returns nothing and changes no count";

-- T3: the hour boundary. A press counted in the PREVIOUS hour is given back to the previous hour.
insert into public.member_translate_usage (profile_id, hour_start, listings)
select id, date_trunc('hour', now()) - interval '1 hour', 5 from public.profiles where email = 'tc-a@example.invalid';
select public.translate_release_slot(id, date_trunc('hour', now()) - interval '1 hour')
  from public.profiles where email = 'tc-a@example.invalid';
select case when (select listings from public.member_translate_usage
                   where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid')
                     and hour_start = date_trunc('hour', now()) - interval '1 hour') = 4
             and (select listings from public.member_translate_usage
                   where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid')
                     and hour_start = date_trunc('hour', now())) = 3
            then 'PASS' else 'FAIL' end
  as "T3 a release goes to the hour it names and leaves the current hour's count where it was";
select public.translate_release_slot(id, date_trunc('hour', now()) - interval '5 hours')
  from public.profiles where email = 'tc-a@example.invalid';
select case when (select count(*) from public.member_translate_usage
                   where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid')) = 2
            then 'PASS' else 'FAIL' end
  as "T4 releasing into an hour that has no row creates nothing";
select public.translate_release_slot(id, date_trunc('hour', now())) from public.profiles where email = 'tc-a@example.invalid';
select public.translate_release_slot(id, date_trunc('hour', now())) from public.profiles where email = 'tc-a@example.invalid';
select public.translate_release_slot(id, date_trunc('hour', now())) from public.profiles where email = 'tc-a@example.invalid';
select public.translate_release_slot(id, date_trunc('hour', now())) from public.profiles where email = 'tc-a@example.invalid';
select case when (select listings from public.member_translate_usage
                   where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid')
                     and hour_start = date_trunc('hour', now())) = 0
            then 'PASS' else 'FAIL' end
  as "T5 a count never goes below zero";

-- T6: the sweep is bounded. 50 old rows; one press deletes at most 20 of them and keeps every fresh row.
insert into public.member_translate_usage (profile_id, hour_start, listings)
select (select id from public.profiles where email = 'tc-a@example.invalid'),
       date_trunc('hour', now()) - interval '2 days' - (g || ' hours')::interval, 1
  from generate_series(1, 50) g;
select public.translate_take_slot(id, 3) from public.profiles where email = 'tc-a@example.invalid';
select case when (select count(*) from public.member_translate_usage where hour_start < now() - interval '1 day') = 30
             and (select count(*) from public.member_translate_usage where hour_start >= now() - interval '2 hours') = 2
            then 'PASS' else 'FAIL' end
  as "T6 one press sweeps at most 20 old rows and touches no fresh row";

-- T7/T8: who may call, and the index.
select case when has_function_privilege('service_role', 'public.translate_take_slot(uuid,integer)', 'execute')
              and has_function_privilege('service_role', 'public.translate_release_slot(uuid,timestamptz)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_take_slot(uuid,integer)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_release_slot(uuid,timestamptz)', 'execute')
              and not has_function_privilege('anon', 'public.translate_take_slot(uuid,integer)', 'execute')
              and not has_function_privilege('anon', 'public.translate_release_slot(uuid,timestamptz)', 'execute')
            then 'PASS' else 'FAIL' end
  as "T7 only the service role can call the two new counters";
select case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'member_translate_usage_hour_idx')
            then 'PASS' else 'FAIL' end
  as "T8 the hour index exists, so the sweep does not scan the table";

-- The revert.
\i sql/revert/070_translate_counters_revert.sql
select case when to_regprocedure('public.translate_take_slot(uuid,integer)') is null
             and to_regprocedure('public.translate_release_slot(uuid,timestamptz)') is null
             and not exists (select 1 from pg_indexes where indexname = 'member_translate_usage_hour_idx')
             and to_regprocedure('public.translate_take_member_slot(uuid,integer)') is not null
             and to_regprocedure('public.translate_release_member_slot(uuid)') is not null
            then 'PASS' else 'FAIL' end
  as "T9 the revert drops the two functions and the index and leaves 069's counters in place";

\i sql/070_translate_counters.sql
select case when pg_get_functiondef('public.translate_take_slot(uuid,integer)'::regprocedure) = (select t from t41_before)
             and pg_get_functiondef('public.translate_release_slot(uuid,timestamptz)'::regprocedure) = (select r from t41_before)
            then 'PASS' else 'FAIL' end
  as "T10 after revert and re-apply the functions are exactly what 070 first produced";
\i sql/070_translate_counters.sql
select case when pg_get_functiondef('public.translate_take_slot(uuid,integer)'::regprocedure) = (select t from t41_before)
             and (select count(*) from pg_indexes where indexname = 'member_translate_usage_hour_idx') = 1
            then 'PASS' else 'FAIL' end
  as "T11 applying 070 a second time changes nothing (idempotent)";

delete from public.member_translate_usage
 where profile_id = (select id from public.profiles where email = 'tc-a@example.invalid');
