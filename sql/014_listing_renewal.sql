-- 014_listing_renewal.sql
--
-- Renewing a listing: a participant saying "this is still current" without
-- changing anything about it.
--
-- The whole thing is a timestamp, which is why it needs a function rather than
-- an UPDATE from the browser. updated_at is not the participant's to write -
-- protect_listing_columns() sets it on every update, precisely so it means "when
-- this row last actually changed" rather than "what the client claimed". A
-- browser refreshing it directly would be writing the column that decides
-- whether a listing is stale, and the staleness of a listing is exactly what
-- somebody with a dormant offer has an incentive to fake.
--
-- So the browser asks, and the database decides: the function checks ownership,
-- touches the row, and records that a renewal happened. The Operator's manual
-- reminder (listings.last_reminder_at) is untouched by any of this and stays
-- theirs.

create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_updated timestamptz;
begin
  if v_profile_id is null then
    raise exception 'No profile for the current session';
  end if;

  -- Ownership is checked here rather than left to RLS, because this is a
  -- definer function and RLS does not stand behind it. An unowned id must not
  -- silently renew somebody else's listing, and must not quietly do nothing
  -- either: the caller is told.
  update public.listings
     set updated_at = now()
   where id = p_listing_id
     and user_id = v_profile_id
  returning updated_at into v_updated;

  if v_updated is null then
    raise exception 'Listing not found, or not yours';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile_id, 'listing_renewed',
            jsonb_build_object('listing_id', p_listing_id));

  return v_updated;
end;
$$;

grant execute on function public.renew_listing(uuid) to authenticated;

-- A renewal belongs in the participant's own record of what they have done, so
-- my_activity_export() (sql/013) learns about it here rather than growing a
-- separate export path.
create or replace function public.my_activity_export()
returns table (
  occurred_at timestamptz,
  category    text,
  reference   text,
  detail      text,
  status      text
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (select public.current_profile_id() as id)

  select l.created_at, 'listing', l.reference_number,
         l.commodity || ' (' || l.type || ')', l.status
    from public.listings l, me
   where l.user_id = me.id

  union all

  select m.created_at, 'message_sent',
         coalesce(l.reference_number, ''), m.body, m.status
    from public.messages m
    left join public.listings l on l.id = m.listing_id, me
   where m.sender_id = me.id

  union all

  select m.created_at, 'message_received',
         coalesce(l.reference_number, ''), m.body, m.status
    from public.message_forward_log f
    join public.messages m on m.id = f.message_id
    left join public.listings l on l.id = m.listing_id, me
   where f.to_user_id = me.id

  union all

  select r.requested_at, 'document_request',
         coalesce(l.reference_number, ''), r.doc_type, r.status
    from public.document_requests r
    left join public.listings l on l.id = r.listing_id, me
   where r.participant_id = me.id

  union all

  select r.responded_at, 'document_response',
         coalesce(l.reference_number, ''), r.doc_type, r.status
    from public.document_requests r
    left join public.listings l on l.id = r.listing_id, me
   where r.participant_id = me.id and r.responded_at is not null

  union all

  select a.created_at, 'listing_renewed',
         coalesce(l.reference_number, ''), l.commodity, l.status
    from public.activity_log a
    left join public.listings l on l.id = (a.details ->> 'listing_id')::uuid, me
   where a.user_id = me.id and a.action = 'listing_renewed'

  union all

  select a.created_at, 'profile_change', '',
         case
           when a.action = 'profile_updated'
             then 'Fields changed: ' || coalesce(
                    (select string_agg(value, ', ' order by value)
                       from jsonb_array_elements_text(a.details -> 'fields') as t(value)),
                    'unknown')
           when a.action = 'email_changed'
             then 'Email changed from ' || coalesce(a.details ->> 'from', '?') ||
                  ' to ' || coalesce(a.details ->> 'to', '?')
           when a.action = 'password_changed' then 'Password changed'
           else a.action
         end,
         a.action
    from public.activity_log a, me
   where a.user_id = me.id
     and a.action in ('profile_updated', 'email_changed', 'password_changed')

  order by 1 desc;
$$;

grant execute on function public.my_activity_export() to authenticated;
