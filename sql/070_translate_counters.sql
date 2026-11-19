-- 070: Translate, counters version 2 (the supervisor's outside code review of 069, 19 Nov 2026).
-- applied-probe: select to_regprocedure('public.translate_take_slot(uuid,integer)') is not null and to_regprocedure('public.translate_release_slot(uuid,timestamptz)') is not null and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'member_translate_usage_hour_idx')
--
-- WHAT IT ADDS (additive: nothing is dropped, 069's objects are untouched, no row changes):
--   1. translate_take_slot(profile, limit): like translate_take_member_slot, but it RETURNS THE HOUR it counted the
--      press in (null when the hourly limit is reached). 069's release gave a press back to the CURRENT hour, so a
--      press taken at 10:59 and given back at 11:01 took a press off the wrong hour.
--   2. translate_release_slot(profile, hour): gives a press back to exactly that hour.
--   3. An index on member_translate_usage(hour_start), and a sweep of old rows that is BOUNDED: at most 20 old rows
--      per call (069 deleted every old row, unindexed, on every press).
-- The two 069 functions it replaces in use (translate_take_member_slot, translate_release_member_slot) are left in
-- place, unused, so that a function version still deployed keeps working while the new one is rolled out; a later
-- migration can drop them.
--
-- Revert: sql/revert/070_translate_counters_revert.sql. Proof: sql/tests/41_translate_counters.sql.

begin;

create index if not exists member_translate_usage_hour_idx on public.member_translate_usage (hour_start);

create or replace function public.translate_take_slot(p_profile uuid, p_limit integer default 30)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hour timestamptz := date_trunc('hour', now());
begin
  -- A bounded sweep: at most 20 rows older than a day per call, found through the index.
  delete from public.member_translate_usage
   where ctid in (select u.ctid from public.member_translate_usage u
                   where u.hour_start < now() - interval '1 day' limit 20);
  insert into public.member_translate_usage (profile_id, hour_start, listings)
    values (p_profile, v_hour, 0)
    on conflict (profile_id, hour_start) do nothing;
  update public.member_translate_usage
     set listings = listings + 1
   where profile_id = p_profile and hour_start = v_hour and listings < p_limit;
  if found then return v_hour; end if;
  return null;
end;
$function$;

create or replace function public.translate_release_slot(p_profile uuid, p_hour timestamptz)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.member_translate_usage
     set listings = greatest(listings - 1, 0)
   where profile_id = p_profile and hour_start = p_hour;
$$;

revoke all on function public.translate_take_slot(uuid, integer)         from public, anon, authenticated;
revoke all on function public.translate_release_slot(uuid, timestamptz)  from public, anon, authenticated;
grant execute on function public.translate_take_slot(uuid, integer)         to service_role;
grant execute on function public.translate_release_slot(uuid, timestamptz)  to service_role;

commit;
