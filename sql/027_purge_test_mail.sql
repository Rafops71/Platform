-- "Clean up old test entries" also clears mail that was never going anywhere.
--
-- WHY
--
-- Found on 2026-10-13 while checking what the platform sends: the outbox held
-- rows queued by test runs, unsent, waiting. They are invisible and harmless
-- today for one reason only - no mail is being sent at all. The day
-- RESEND_API_KEY is set, the queue flushes, and whatever is in it goes.
--
-- One of those rows was seven weeks old, about a test listing, addressed to
-- somebody nobody could identify. That is not a tidy-up issue; it is the
-- platform's first impression arriving by accident.
--
-- WHAT IT WILL AND WILL NOT DELETE
--
-- Only UNSENT mail to an address that cannot belong to a real member:
--
--   *@example.invalid, *@example.com, *@example.org, *@example.net
--       reserved by RFC 2606 precisely so they can never be delivered
--   jericho-e2e-*
--       the prefix the Playwright fixtures use for everything they create
--
-- It will NOT delete mail queued to a real address, however old or however
-- stuck. A member's notification that failed to send is a problem to look at,
-- not a row to make disappear: deleting it loses the evidence and the member
-- never finds out either way. Mail already sent is left alone too - that is a
-- record of something that happened, and the record is the point.

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_activity integer;
  v_notifications integer;
  v_mail integer;
  v_total integer;
begin
  -- Operators only, and only Operators who are still active (sql/026).
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator'
                    and p.status = 'approved') then
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

  -- 2. The Operator feed. Unchanged from 023.
  delete from public.notifications n
   where n.related_id is not null
     and not exists (select 1 from public.listings l where l.id = n.related_id)
     and not exists (select 1 from public.profiles p where p.id = n.related_id)
     and not exists (select 1 from public.messages m where m.id = n.related_id);
  get diagnostics v_notifications = row_count;

  -- 3. Mail that was never going to reach anybody. New in 027.
  delete from public.email_outbox e
   where e.sent_at is null
     and (e.to_email like 'jericho-e2e-%'
       or e.to_email like '%@example.invalid'
       or e.to_email like '%@example.com'
       or e.to_email like '%@example.org'
       or e.to_email like '%@example.net');
  get diagnostics v_mail = row_count;

  v_total := v_activity + v_notifications + v_mail;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_total,
                               'activity_log', v_activity,
                               'notifications', v_notifications,
                               'test_mail', v_mail));

  return v_total;
end;
$$;
