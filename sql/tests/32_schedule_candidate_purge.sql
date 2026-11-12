-- 32_schedule_candidate_purge.sql
--
-- Proves sql/061 and its revert (the daily purge of closed candidate recommendations):
--   * on a server that does not offer pg_cron (this one) the migration runs cleanly and
--     creates nothing: no extension, no cron schema, no job;
--   * where pg_cron's two functions exist, exactly ONE job named
--     'purge-closed-candidate-recommendations' is scheduled, '17 3 * * *', running
--     'select public.purge_closed_candidate_recommendations();';
--   * running the migration again leaves exactly one job (idempotent), even though the
--     stand-in raises an error when asked to unschedule a name it does not know;
--   * a job with another name survives the migration and the revert;
--   * the revert removes our job, and runs again without error when it is already gone;
--   * on a server without pg_cron the revert and the migration run cleanly too.
-- pg_cron is NOT in the embedded PostgreSQL this suite uses, so its two functions are stood in
-- for by a schema 'cron' with cron.schedule(text,text,text), cron.unschedule(text) and a job
-- table, created here and dropped at the end. That the REAL extension installs, schedules and
-- is dropped on Supabase can only be seen on the live database and is NOT proven here.
-- The migration and its revert are run from their own files (\i).

\set QUIET on
\pset pager off

\echo
\echo '=========== THE DAILY PURGE SCHEDULE ==========='

-- The migration has already run once in this suite's setup, on a server without pg_cron.
select case when not exists (select 1 from pg_available_extensions where name = 'pg_cron')
             and not exists (select 1 from pg_extension where extname = 'pg_cron')
             and not exists (select 1 from pg_namespace where nspname = 'cron')
            then 'PASS' else 'FAIL' end
  as "T1 without pg_cron the migration created nothing: no extension, no cron schema";

-- A stand-in for the two pg_cron functions, behaving as the documented ones do: schedule(name,
-- schedule, command) returns the job id; unschedule(name) returns true if a job was removed -
-- and, to be hard on the migration, RAISES for a name it does not know.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $f$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
    returning jobid into v;
  return v;
end $f$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $f$
begin
  delete from cron.job where jobname = job_name;
  if not found then raise exception 'could not find valid entry for job %', job_name; end if;
  return true;
end $f$;
insert into cron.job (jobname, schedule, command) values ('someone-elses-job', '0 1 * * *', 'select 1');

\i sql/061_schedule_candidate_purge.sql

select case when count(*) = 1 and bool_and(schedule = '17 3 * * *')
             and bool_and(command = 'select public.purge_closed_candidate_recommendations();')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 the migration schedules exactly one job, daily at 03:17 UTC, running the purge"
from cron.job where jobname = 'purge-closed-candidate-recommendations';

\i sql/061_schedule_candidate_purge.sql

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 running the migration again leaves exactly one such job (idempotent)"
from cron.job where jobname = 'purge-closed-candidate-recommendations';

select case when count(*) = 1 and bool_and(schedule = '0 1 * * *' and command = 'select 1')
            then 'PASS' else 'FAIL' end
  as "T4 a job with another name is not touched by the migration"
from cron.job where jobname = 'someone-elses-job';

\i sql/revert/061_schedule_candidate_purge_revert.sql

select case when not exists (select 1 from cron.job where jobname = 'purge-closed-candidate-recommendations')
            then 'PASS' else 'FAIL' end
  as "T5 the revert removes the job";

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 the revert leaves a job with another name alone"
from cron.job where jobname = 'someone-elses-job';

\i sql/revert/061_schedule_candidate_purge_revert.sql

select case when not exists (select 1 from cron.job where jobname = 'purge-closed-candidate-recommendations')
            then 'PASS' else 'FAIL' end
  as "T7 the revert runs again, with the job already gone, without error";

-- Put the server back as it was, then run the revert and the migration where pg_cron is not there.
drop schema cron cascade;

\i sql/revert/061_schedule_candidate_purge_revert.sql
\i sql/061_schedule_candidate_purge.sql

select case when not exists (select 1 from pg_namespace where nspname = 'cron')
             and not exists (select 1 from pg_extension where extname = 'pg_cron')
            then 'PASS' else 'FAIL' end
  as "T8 without pg_cron the revert and the migration both run cleanly and create nothing";

select case when has_function_privilege('anon', 'public.purge_closed_candidate_recommendations(timestamptz)', 'execute') = false
             and has_function_privilege('authenticated', 'public.purge_closed_candidate_recommendations(timestamptz)', 'execute') = false
            then 'PASS' else 'FAIL' end
  as "T9 the purge function is still not executable by a signed-in member or a stranger";
