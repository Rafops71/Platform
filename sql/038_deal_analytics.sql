-- 038: deal counts over time - the "deals closed" the deal log was for.
--
-- docs/AGREED-2026-10-25.md item 27: "A deal log - needed for 'deals closed'".
-- sql/035's deal files are that log. This counts them per period, for the
-- Analytics screen, beside operator_analytics() (sql/015) rather than inside
-- it: that function's six columns are asserted by sql/tests/09 T15, and its
-- "introductions" is every forwarded message - not the same thing as a deal
-- file reaching "introduced". Both are shown, each under its own name.
--
-- Same shape and guards as operator_analytics: Operators only, the bucket
-- matched against a fixed list, at most 52 periods.

begin;

create or replace function public.deal_analytics(
  p_bucket text default 'week',
  p_periods int default 12
)
returns table (
  period_start  date,
  opened        bigint,
  agreed        bigint,
  introduced    bigint,
  closed_done   bigint,
  fell_through  bigint
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_unit text;
  v_from timestamptz;
begin
  if not public.is_operator() then
    raise exception 'Operators only' using errcode = '42501';
  end if;
  v_unit := case lower(coalesce(p_bucket, 'week'))
              when 'month' then 'month' when 'day' then 'day' else 'week' end;
  p_periods := least(greatest(coalesce(p_periods, 12), 1), 52);
  v_from := date_trunc(v_unit, now()) - ((p_periods - 1) || ' ' || v_unit)::interval;

  return query
  with periods as (
    select generate_series(date_trunc(v_unit, v_from), date_trunc(v_unit, now()),
                           ('1 ' || v_unit)::interval) as period
  )
  select p.period::date,
    (select count(*) from public.deals d where date_trunc(v_unit, d.opened_at) = p.period),
    (select count(*) from public.deals d where date_trunc(v_unit, d.agreed_at) = p.period),
    (select count(*) from public.deals d where date_trunc(v_unit, d.introduced_at) = p.period),
    (select count(*) from public.deals d where d.deal_result = 'closed'
        and date_trunc(v_unit, coalesce(d.closed_at, d.updated_at)) = p.period),
    (select count(*) from public.deals d where d.deal_result = 'fell_through'
        and date_trunc(v_unit, coalesce(d.closed_at, d.updated_at)) = p.period)
  from periods p
  order by p.period desc;
end;
$function$;

revoke execute on function public.deal_analytics(text, int) from public, anon;
grant  execute on function public.deal_analytics(text, int) to authenticated;

commit;
