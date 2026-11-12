-- Revert 061: stop the daily purge of candidate recommendations.
--
-- This only removes the schedule. It CANNOT restore any recommendation that the daily
-- purge has already deleted (sql/055 deletes closed rows 12 months after they close).
--
--   1. Unschedules the job 'purge-closed-candidate-recommendations', if pg_cron is there.
--      Nothing is an error: a job that is already gone, or pg_cron not installed, is fine.
--   2. Drops the pg_cron extension ONLY if no job at all is left in cron.job; if any other
--      job uses it, the extension stays and a NOTICE says so.
--      (An extension installed before 061 for no job at all is dropped too: this cannot tell.)

begin;

do $revert$
declare
  v_left integer;
begin
  if to_regprocedure('cron.unschedule(text)') is null then
    raise notice 'pg_cron is not installed here: nothing to unschedule';
  else
    begin
      perform cron.unschedule('purge-closed-candidate-recommendations');
    exception when others then
      raise notice 'no job named purge-closed-candidate-recommendations was found: nothing to unschedule';
    end;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select count(*) from cron.job' into v_left;
    if v_left = 0 then
      drop extension pg_cron;
    else
      raise notice 'pg_cron is left installed: % other job(s) use it', v_left;
    end if;
  end if;
end
$revert$;

commit;
