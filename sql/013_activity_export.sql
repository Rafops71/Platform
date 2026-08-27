-- 013_activity_export.sql
--
-- One function returning everything a participant has done on the platform, as
-- a flat list of dated events, for them to download as a CSV.
--
-- Why a function rather than four queries from the browser: two of the four
-- sources are not readable by a participant at all. activity_log is
-- Operator-only, and messages sent *to* someone are reached through
-- message_forward_log rather than by owning them. The alternatives were to open
-- those tables up with new policies - widening what every participant can read
-- for the sake of an export - or to assemble the answer once, here, where the
-- filter is written into the query and cannot be forgotten by a caller.
--
-- Every branch below filters on current_profile_id(). There is no argument to
-- pass, so there is no participant id for a caller to substitute for somebody
-- else's: the function answers for whoever is asking and for nobody else.
--
-- Anonymity is unchanged. A message row carries the direction, the listing it
-- concerns and the participant's own text; it never carries who the
-- counterparty was, because the platform itself only ever tells them that
-- through an Operator.

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

  -- Listings the participant posted.
  select l.created_at, 'listing', l.reference_number,
         l.commodity || ' (' || l.type || ')', l.status
    from public.listings l, me
   where l.user_id = me.id

  union all

  -- Messages they wrote, and messages an Operator forwarded to them. Both are
  -- theirs; only one of them is a row they own.
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

  -- Documents an Operator asked them about, and what they answered.
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

  -- Account changes, from the audit trail. Only the participant's own actions:
  -- activity_log.user_id is who did the thing, so an Operator approving them
  -- is the Operator's row and stays out of this.
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

-- Operators are not excluded: the function answers for whoever calls it, so an
-- Operator asking gets their own activity, which is the same promise.
grant execute on function public.my_activity_export() to authenticated;
