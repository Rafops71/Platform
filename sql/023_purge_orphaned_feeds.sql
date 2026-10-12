-- 023_purge_orphaned_feeds.sql
--
-- Extends the purge from one table to the whole class.
--
-- sql/021 cleaned the activity log and stopped there. The full stress run on
-- 2026-10-12 showed why that was not enough. Measured on the live project:
--
--     notifications                4,776
--     pointing at something gone   4,770
--     created that day alone       1,390
--
-- Every one of those is addressed to the owner's own Operator account. That is
-- why deleting the test fixtures never removed them: notifications cascade from
-- the profile they are ADDRESSED TO, not the thing they are ABOUT. A test
-- member posts a listing, trg_notify_new_listing writes "new listing" to every
-- Operator - a real account - and when the test member and their listing are
-- deleted, the notification survives, pointing at a listing that no longer
-- exists. The Operator's feed had 4,776 entries of which six were real.
--
-- The same shape, found twice in one day, in two tables. The lesson from the
-- stale-render guard applies here too: fixing the instance and not the class
-- means finding it again next week in a third place. So this covers every feed
-- table that can outlive what it describes, and names them in one list:
--
--     activity_log      (already handled by 021, kept here unchanged)
--     notifications     the Operator's feed
--
-- email_outbox was the third candidate and is deliberately NOT here. Writing
-- the delete for it and running the test is what showed why: its
-- related_listing_id carries a foreign key to listings, so a queued email about
-- a listing that no longer exists cannot be created in the first place - the
-- insert is refused, and the live count of such rows is zero for that reason
-- and not by luck. notifications.related_id has no such constraint, which is
-- exactly why that table accumulated 4,770 of them and the outbox did not.
--
-- The branch is removed rather than left in as harmless, because a delete that
-- can never fire, under a comment saying it cleans queued mail, is a claim the
-- code does not honour.
--
-- The rule is the same narrow one, unchanged: a row goes only if the thing it
-- names is already gone. Nothing that points at a live listing, a live message
-- or a live profile is touched, whatever its age, and the function still takes
-- no arguments so nothing can widen it.

begin;

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_activity integer;
  v_notifications integer;
  v_total integer;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

  -- 1. The audit trail. Unchanged from 021.
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
  get diagnostics v_activity = row_count;

  -- 2. The Operator feed. related_id is a listing, a profile or a message
  --    depending on the notification's type, and the type names are not worth
  --    trusting for this - a row whose target is absent from ALL THREE is
  --    about something that no longer exists, whichever it was.
  --
  --    A null related_id is left alone: it points at nothing by design rather
  --    than by deletion, so "the thing it names is gone" does not apply.
  delete from public.notifications n
   where n.related_id is not null
     and not exists (select 1 from public.listings l where l.id = n.related_id)
     and not exists (select 1 from public.profiles p where p.id = n.related_id)
     and not exists (select 1 from public.messages m where m.id = n.related_id);
  get diagnostics v_notifications = row_count;

  v_total := v_activity + v_notifications;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_total,
                               'activity_log', v_activity,
                               'notifications', v_notifications));

  return v_total;
end;
$function$;

commit;
