-- 037: the reliability scorecard - numbers only, Operators only.
--
-- docs/AGREED-2026-10-25.md item 26: "numbers first, which are testable; an
-- AI-written summary on top, which advises and never decides". This is the
-- numbers. docs/research/SCORECARD-DATA-PROTECTION.md is why it looks the way
-- it does:
--
--   * facts, not verdicts - every figure is a count of answers an Operator
--     recorded in a deal file (sql/035), nothing inferred;
--   * a deal file's outcome describes the deal, not one side of it, so each
--     member's counts are split by the side they were on (poster of the
--     listing, or the other party) and never blamed on either;
--   * Operators only. A member's own request to see what is held on them is
--     answered by an Operator producing this row and their deal files - the
--     function serves that too, by taking one member's id.
--
-- No score, no ranking, no label. Turning counts into a judgement is the
-- Operators' job, and the law's line between a person deciding and an
-- automated decision is kept by never computing one here.

begin;

create or replace function public.member_scorecard(p_profile_id uuid default null)
returns table (
  profile_id        uuid,
  deals_as_poster   bigint,
  deals_as_other    bigint,
  introduced        bigint,
  closed_done       bigint,
  fell_through      bigint,
  docs_matched      bigint,
  docs_not_matched  bigint,
  docs_never_arrived bigint,
  docs_faulty       bigint,
  docs_false        bigint,
  offer_real        bigint,
  offer_did_not_happen bigint,
  offer_not_genuine bigint,
  last_activity     timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_operator() then
    raise exception 'Operators only.' using errcode = '42501';
  end if;

  return query
    with sides as (
      select d.*, d.owner_id as member, 'poster'::text as side from public.deals d where d.owner_id is not null
      union all
      select d.*, d.counterparty_id, 'other' from public.deals d where d.counterparty_id is not null
    )
    select s.member,
           count(*) filter (where s.side = 'poster'),
           count(*) filter (where s.side = 'other'),
           count(*) filter (where s.introduced_at is not null),
           count(*) filter (where s.deal_result = 'closed'),
           count(*) filter (where s.deal_result = 'fell_through'),
           count(*) filter (where s.docs_match = 'matched'),
           count(*) filter (where s.docs_match = 'not_matched'),
           count(*) filter (where s.docs_match = 'never_arrived'),
           count(*) filter (where s.docs_genuine = 'faulty'),
           count(*) filter (where s.docs_genuine = 'false'),
           count(*) filter (where s.offer_real = 'real'),
           count(*) filter (where s.offer_real = 'did_not_happen'),
           count(*) filter (where s.offer_real = 'not_genuine'),
           max(s.updated_at)
      from sides s
     where p_profile_id is null or s.member = p_profile_id
     group by s.member;
end;
$function$;

revoke execute on function public.member_scorecard(uuid) from public, anon;
grant  execute on function public.member_scorecard(uuid) to authenticated;

commit;
