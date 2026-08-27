-- 015_operator_analytics.sql
--
-- Counts over time for the Operator: registrations, listings, messages
-- reviewed, introductions made, matches reviewed.
--
-- Three of those five are events with no timestamp. A listing and a
-- registration have created_at, and a forward has sent_at, but "reviewed"
-- was only ever a status: a message that had been dealt with said so, without
-- saying when. Bucketing those by created_at would answer a different question -
-- when the work arrived, not when it was done - and the arrival dates are
-- already the other two columns. So reviewed_at is added to messages and
-- matches, written by a trigger at the moment the status leaves its unreviewed
-- value.
--
-- Rows that were already reviewed before this migration have no reviewed_at and
-- are counted in no period. That is deliberate: inventing a date for them would
-- put work on days it did not happen, and a backfill from created_at would be
-- exactly the wrong answer described above.

-- ------------------------------------------------------- reviewed_at ----

alter table public.messages add column if not exists reviewed_at timestamptz;
alter table public.matches  add column if not exists reviewed_at timestamptz;

comment on column public.messages.reviewed_at is
  'When an Operator first acted on this message (forwarded, replied, ignored). '
  'Null for messages still pending, and for anything reviewed before sql/015.';

create or replace function public.stamp_message_reviewed()
returns trigger
language plpgsql
as $$
begin
  -- Only the first transition out of pending_review counts. A message that is
  -- forwarded and later re-classified was reviewed once, on the earlier day.
  if old.status = 'pending_review' and new.status <> 'pending_review'
     and new.reviewed_at is null then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_message_reviewed on public.messages;
create trigger trg_stamp_message_reviewed
  before update on public.messages
  for each row execute function public.stamp_message_reviewed();

create or replace function public.stamp_match_reviewed()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'new' and new.status <> 'new' and new.reviewed_at is null then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_match_reviewed on public.matches;
create trigger trg_stamp_match_reviewed
  before update on public.matches
  for each row execute function public.stamp_match_reviewed();

-- --------------------------------------------------------- the series ----
--
-- One row per period, including the periods where nothing happened - a gap in a
-- table of counts reads as "no data" when it means "no activity", and the
-- difference matters when the question is whether the platform is busier than
-- it was.
--
-- Operator-only, checked inside the function: this is a definer function, so
-- RLS is not behind it, and platform-wide counts are exactly what a participant
-- should not be able to derive. They are told nothing about who is doing what -
-- these are counts and nothing else - but how many people registered last month
-- is still the Operators' business.

create or replace function public.operator_analytics(
  p_bucket text default 'week',
  p_periods int default 12
)
returns table (
  period_start      date,
  registrations     bigint,
  listings          bigint,
  messages_reviewed bigint,
  introductions     bigint,
  matches_reviewed  bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_unit text;
  v_from timestamptz;
begin
  if not public.is_operator() then
    raise exception 'Operators only';
  end if;

  -- The unit is interpolated into date_trunc(), so it is matched against a
  -- fixed list rather than passed through: a text argument reaching a query is
  -- how injection happens, even in a function only Operators can call.
  v_unit := case lower(coalesce(p_bucket, 'week'))
              when 'month' then 'month'
              when 'day'   then 'day'
              else 'week'
            end;

  p_periods := least(greatest(coalesce(p_periods, 12), 1), 52);
  v_from := date_trunc(v_unit, now()) - ((p_periods - 1) || ' ' || v_unit)::interval;

  return query
  with periods as (
    select generate_series(
             date_trunc(v_unit, v_from),
             date_trunc(v_unit, now()),
             ('1 ' || v_unit)::interval
           ) as period
  )
  select
    p.period::date,
    (select count(*) from public.profiles x
      where date_trunc(v_unit, x.created_at) = p.period),
    (select count(*) from public.listings x
      where date_trunc(v_unit, x.created_at) = p.period),
    (select count(*) from public.messages x
      where x.reviewed_at is not null and date_trunc(v_unit, x.reviewed_at) = p.period),
    (select count(*) from public.message_forward_log x
      where date_trunc(v_unit, x.sent_at) = p.period),
    (select count(*) from public.matches x
      where x.reviewed_at is not null and date_trunc(v_unit, x.reviewed_at) = p.period)
  from periods p
  order by p.period desc;
end;
$$;

grant execute on function public.operator_analytics(text, int) to authenticated;
