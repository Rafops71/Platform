-- 22_member_scorecard.sql - proves sql/037: counts of recorded outcomes,
-- split by side, for Operators only.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE SCORECARD COUNTS WHAT WAS RECORDED ==========='

select public.test_invite('sc-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('e2e2e2e2-0001-0001-0001-000000000001'::uuid, 'sc-op@example.invalid',
  jsonb_build_object('first_name','Sid','last_name','Operator','phone','+3200000401','country','Chile','language','en'));
update public.profiles set role = 'operator', status = 'approved' where email = 'sc-op@example.invalid';
select public.test_invite('sc-sam@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('e2e2e2e2-0002-0002-0002-000000000002'::uuid, 'sc-sam@example.invalid',
  jsonb_build_object('first_name','Sam','last_name','Seller','phone','+3200000402','country','Chile','language','en'));
select public.test_invite('sc-bea@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('e2e2e2e2-0003-0003-0003-000000000003'::uuid, 'sc-bea@example.invalid',
  jsonb_build_object('first_name','Bea','last_name','Buyer','phone','+3200000403','country','Peru','language','en'));
update public.profiles set status = 'approved' where email in ('sc-sam@example.invalid','sc-bea@example.invalid');
select public.test_sign_approved();

-- Two files with Sam as the poster: one whose documents never arrived and
-- fell through, one introduced and closed with matching documents.
insert into public.deals (listing_ref, owner_id, counterparty_id, docs_match, deal_result)
select 'SELL-SC-1', s.id, b.id, 'never_arrived', 'fell_through'
  from public.profiles s, public.profiles b where s.email = 'sc-sam@example.invalid' and b.email = 'sc-bea@example.invalid';
insert into public.deals (listing_ref, owner_id, counterparty_id, docs_match, docs_genuine, deal_result, introduced_at)
select 'SELL-SC-2', s.id, b.id, 'matched', 'genuine', 'closed', now()
  from public.profiles s, public.profiles b where s.email = 'sc-sam@example.invalid' and b.email = 'sc-bea@example.invalid';

set role authenticated; set test.uid='e2e2e2e2-0001-0001-0001-000000000001';
create temp table t22 as
  select * from public.member_scorecard((select id from public.profiles where email = 'sc-sam@example.invalid'));
reset role; reset test.uid;

select case when deals_as_poster = 2 and deals_as_other = 0 and docs_never_arrived = 1
             and docs_matched = 1 and fell_through = 1 and closed_done = 1 and introduced = 1
            then 'PASS' else 'FAIL ' || row_to_json(t22)::text end
  as "T1 Item74 the figures are counts of what Operators recorded"
from t22;

set role authenticated; set test.uid='e2e2e2e2-0001-0001-0001-000000000001';
select case when deals_as_other = 2 and deals_as_poster = 0 and docs_never_arrived = 1
            then 'PASS' else 'FAIL' end
  as "T2 Item74 the other party's counts are kept apart, by side"
from public.member_scorecard((select id from public.profiles where email = 'sc-bea@example.invalid'));
reset role; reset test.uid;

\echo
\echo '=========== OPERATORS ONLY ==========='

create temp table t22b (msg text);
grant all on t22b to authenticated;
set role authenticated; set test.uid='e2e2e2e2-0002-0002-0002-000000000002';
do $$ begin
  perform * from public.member_scorecard(null);
  insert into t22b values ('ACCEPTED');
exception when others then insert into t22b values (sqlerrm); end $$;
reset role; reset test.uid;

select case when msg = 'Operators only.' then 'PASS' else 'FAIL got ' || msg end
  as "T3 Item73 a member cannot read any scorecard, their own included"
from t22b;

select case when not has_function_privilege('anon', 'public.member_scorecard(uuid)', 'execute')
            then 'PASS' else 'FAIL' end
  as "T4 Item73 a visitor who is not signed in cannot call it";

\echo
\echo '=========== DEALS CLOSED, OVER TIME (sql/038) ==========='

set role authenticated; set test.uid='e2e2e2e2-0001-0001-0001-000000000001';
select case when sum(closed_done) >= 1 and sum(fell_through) >= 1 and sum(introduced) >= 1
            then 'PASS' else 'FAIL' end
  as "T5 Item75 deals closed and fallen through are counted by period"
from public.deal_analytics('week', 2);
reset role; reset test.uid;

set role authenticated; set test.uid='e2e2e2e2-0002-0002-0002-000000000002';
do $$ begin
  perform * from public.deal_analytics('week', 2);
  insert into t22b values ('ANALYTICS ACCEPTED');
exception when others then null; end $$;
reset role; reset test.uid;

select case when not exists (select 1 from t22b where msg = 'ANALYTICS ACCEPTED') then 'PASS' else 'FAIL' end
  as "T6 Item43 a member cannot read the deal figures";

delete from public.deals where listing_ref like 'SELL-SC-%';
