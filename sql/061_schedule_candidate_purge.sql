-- 061: run the retention purge of candidate recommendations once a day (owner's decision,
-- 2026-11-12: "switch on pg_cron and run the 055 purge daily").
--
-- WARNING - THIS DELETES DATA. Once scheduled, every day at 03:17 UTC the job calls
-- public.purge_closed_candidate_recommendations() (sql/055), which deletes a candidate
-- recommendation 12 months after it was CLOSED (declined, or invited and then used, expired
-- or deleted). The revert of THIS migration only stops the schedule; it cannot restore a
-- single row the purge has already deleted. Open recommendations are never purged.
--
-- WHAT IT DOES
--   1. Installs the pg_cron extension, but only if the server offers it (pg_available_extensions).
--      Where it is not offered (the test database), it says so in a NOTICE and goes no further:
--      it never fails and never creates anything.
--   2. Where pg_cron's functions exist, it schedules ONE job named
--      'purge-closed-candidate-recommendations': daily, 17 3 * * * (03:17 UTC, off the hour),
--      command  select public.purge_closed_candidate_recommendations();
--      Idempotent: an existing job of that name is unscheduled first, so running it again
--      leaves exactly one job. A job with any other name is never touched.
--   The job runs as the role that applies this migration; the purge function is executable by
--   that role and by service_role only (sql/055).
-- Revert: sql/revert/061_schedule_candidate_purge_revert.sql.
-- Proof: sql/tests/32_schedule_candidate_purge.sql (the guarded path on this server, and the
-- scheduling logic against a stand-in for pg_cron's two functions).

begin;

do $install$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron is not available on this server: the daily purge is NOT scheduled';
  end if;
end
$install$;

do $schedule$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('cron.unschedule(text)') is null then
    raise notice 'pg_cron functions not found: the daily purge is NOT scheduled';
    return;
  end if;
  -- An existing job of this name goes first. Whether pg_cron answers "false" or raises an
  -- error for a name it does not know, that is the expected state on a first run.
  begin
    perform cron.unschedule('purge-closed-candidate-recommendations');
  exception when others then
    null;
  end;
  perform cron.schedule('purge-closed-candidate-recommendations', '17 3 * * *',
                        'select public.purge_closed_candidate_recommendations();');
end
$schedule$;

commit;
