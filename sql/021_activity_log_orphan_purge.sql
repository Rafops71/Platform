-- 021_activity_log_orphan_purge.sql
--
-- Removes activity rows that describe accounts and listings which no longer
-- exist, and gives the Operator a way to run that again.
--
-- The problem, measured on the live project on 2026-10-12:
--
--     total rows                           12,399
--     residue from deleted test fixtures   12,382
--     the owner's real history                 17
--
-- The log triggers record public.current_profile_id(), which resolves
-- auth.uid(). auth.uid() is null on a direct PostgreSQL connection, which is
-- how the browser suite seeds and tears down - so every row a fixture caused
-- was born with a null user_id, and the teardown's `user_id = any(ids)`
-- predicate could never match one. Seven weeks of runs accumulated unseen.
-- tests/e2e/helpers/fixtures.js now matches on what a row SAYS rather than on
-- who did it, so this stops growing; this file clears what is already there.
--
-- WHY A PURGE AND NOT AN ERASE BUTTON
--
-- The owner asked for a button to erase the activity log. This is deliberately
-- not that, and the difference matters to him specifically. Section 8 of the
-- Terms claims a commission for 24 months after an introduction is made, and
-- the activity log is the evidence that the introduction happened. A button
-- that erases it destroys his own proof of claim. Checklist item 52 also tests
-- that the log cannot be written or altered by hand, which an erase button
-- would contradict head-on.
--
-- So the rule here is narrow and provable: a row goes ONLY if it has no actor
-- AND the thing it describes is already gone. A row about a live account or a
-- live listing is never touched, whatever its age, and no argument can widen
-- it - the function takes no parameters.
--
-- Verified against live before being written: the predicate selected exactly
-- 12,382 rows and left exactly the 17 the owner made himself.

begin;

-- Three no-op probe functions were created on the live project on 2026-10-12
-- while working out why the Supabase SQL tool would not accept this file. They
-- do nothing and are reachable by nobody, but a function nobody meant to ship
-- is exactly the kind of thing that is still there in a year.
drop function if exists public.jericho_ddl_probe();
drop function if exists public.jericho_ddl_probe2();
drop function if exists public.jericho_ddl_probe3();
drop function if exists public.jericho_ddl_probe4();

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted integer;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

  delete from public.activity_log a
   where a.user_id is null
     and (
       (jsonb_exists(a.details, 'profile_id')
         and not exists (select 1 from public.profiles p
                          where p.id = (a.details->>'profile_id')::uuid))
       or
       (jsonb_exists(a.details, 'listing_id')
         and not exists (select 1 from public.listings l
                          where l.id = (a.details->>'listing_id')::uuid))
     );

  get diagnostics v_deleted = row_count;

  -- The purge is itself an event worth recording, so the log says why it
  -- shrank. This row has an actor and names no vanished thing, so a later
  -- purge can never remove it.
  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_deleted));

  return v_deleted;
end;
$function$;

revoke execute on function public.purge_orphaned_activity() from public, anon;
grant execute on function public.purge_orphaned_activity() to authenticated;

commit;
