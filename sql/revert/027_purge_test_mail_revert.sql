-- The way back from sql/027_purge_test_mail.sql.
--
-- purge_orphaned_activity() as it stood after 026 and before 027: the same
-- Operator-and-active check, the audit-trail branch and the Operator-feed
-- branch, with NO test-mail branch.
--
-- Running this file means the purge button stops clearing unsent mail to
-- addresses that can never receive it. Nothing is lost by running it; the mail
-- simply stays queued, which is the state that put a seven-week-old notice one
-- API key away from being delivered.
--
-- This is the correct revert for 027 alone. The 026 revert goes back further
-- and would also undo the suspended-Operator check, which is not what anybody
-- undoing 027 wants.

CREATE OR REPLACE FUNCTION public.purge_orphaned_activity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activity integer;
  v_notifications integer;
  v_total integer;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator'
                    and p.status = 'approved') then
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
  get diagnostics v_activity = row_count;

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
