-- 37_readiness_ticks.sql
--
-- Proves sql/066 and its revert (owner's readiness ticks, 2026-11-16; checklist Item 66):
--   * a Principal's ticks are stored; the Producer ticks only for a producer, the Trader ticks
--     only for a trader, the buyer tick only on a Buy request; foreign ticks are dropped;
--   * a non-principal (mandated, broker) never keeps a tick; changing the role clears them;
--   * the ticks are PROHIBITED from reaching another member: Browse's feed has no readiness
--     column, and another member's direct read of the listing returns no row;
--   * the owner's own read works; an unknown tick value is refused by the table;
--   * changing a tick re-dates truth_confirmed_at (the one date shown), and nobody but the
--     server can set it; an Operator update cannot change ticks;
--   * the revert removes the column and restores the 064 function; re-applying gives exactly
--     what 066 first produced.
-- The file ends with 066 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== READINESS TICKS ==========='

-- Test 35 ends by re-applying 064, which puts 064's statements function back over 066's.
-- Apply 066 again so this file tests the function the live site runs.
\i sql/066_readiness_ticks.sql

select public.test_invite('tick-a@example.invalid');
select public.test_invite('tick-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('f6f6f6f6-0037-0037-0037-000000000001'::uuid, 'tick-a@example.invalid',
  jsonb_build_object('first_name','Tia','last_name','Ticker','phone','+3200003701','country','Chile','language','en')),
 ('f6f6f6f6-0037-0037-0037-000000000002'::uuid, 'tick-b@example.invalid',
  jsonb_build_object('first_name','Boris','last_name','Other','phone','+3200003702','country','Chile','language','en'));
update public.profiles set status = 'approved' where email in ('tick-a@example.invalid','tick-b@example.invalid');
select public.test_sign_approved();

create temp table t37_ref (label text, id uuid); grant all on t37_ref to authenticated;

-- A: a producer who ticks both producer ticks and one trader tick (the trader tick must be dropped).
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000001';
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, principal_kind, docs_seen, truth_confirmed, readiness)
select id, 'sell', 'Tick Copper', 'FOB', 'Chile', 'SELL-TICK-P', 'principal', 'producer', 'yes', true,
       array['own_available','own_scheduled','ex_stock']
  from public.profiles where email = 'tick-a@example.invalid';
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, principal_kind, docs_seen, truth_confirmed, readiness)
select id, 'sell', 'Tick Zinc', 'FOB', 'Chile', 'SELL-TICK-T', 'principal', 'trader', 'yes', true,
       array['ex_stock','back_to_back','own_available']
  from public.profiles where email = 'tick-a@example.invalid';
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, docs_seen, truth_confirmed, readiness, broker_via)
select id, 'sell', 'Tick Lead', 'FOB', 'Chile', 'SELL-TICK-B', 'broker', 'yes', true,
       array['ex_stock'], 'principal'
  from public.profiles where email = 'tick-a@example.invalid';
insert into public.listings (user_id, type, commodity, incoterm, destination, reference_number,
                             poster_role, truth_confirmed, readiness)
select id, 'buy', 'Tick Nickel', 'CIF', 'Chile', 'BUY-TICK-1', 'principal', true,
       array['buy_ready','own_available']
  from public.profiles where email = 'tick-a@example.invalid';
reset role; reset test.uid;

select case when readiness = array['own_available','own_scheduled'] then 'PASS' else 'FAIL got ' || coalesce(readiness::text,'null') end
  as "T1 a producer keeps the two producer ticks and loses a trader tick"
from public.listings where reference_number = 'SELL-TICK-P';
select case when readiness = array['back_to_back','ex_stock'] then 'PASS' else 'FAIL got ' || coalesce(readiness::text,'null') end
  as "T2 a trader keeps the two trader ticks and loses a producer tick"
from public.listings where reference_number = 'SELL-TICK-T';
select case when readiness is null then 'PASS' else 'FAIL got ' || readiness::text end
  as "T3 a broker never keeps a tick"
from public.listings where reference_number = 'SELL-TICK-B';
select case when readiness = array['buy_ready'] then 'PASS' else 'FAIL got ' || coalesce(readiness::text,'null') end
  as "T4 a buyer keeps the one buyer tick and loses a seller tick"
from public.listings where reference_number = 'BUY-TICK-1';

-- T5/T6: PROHIBITION - another member never sees the tick.
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000002';
select case when (select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
                   where json_object_keys = 'readiness') = 0
             and (select count(*) from public.get_public_listings() where reference_number like '%-TICK-%') >= 1
            then 'PASS' else 'FAIL' end
  as "T5 Browse's feed has no readiness column, though the listings are in it";
select case when (select count(*) from public.listings where reference_number like '%-TICK-%') = 0
            then 'PASS' else 'FAIL' end
  as "T6 another member cannot read the listing, so cannot read its ticks";
reset role; reset test.uid;

-- T7: the owner can read their own ticks.
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000001';
select case when (select readiness from public.listings where reference_number = 'SELL-TICK-P') = array['own_available','own_scheduled']
            then 'PASS' else 'FAIL' end
  as "T7 the owner reads their own ticks";
reset role; reset test.uid;

-- T8: an unknown tick value is refused by the table.
create temp table t37_msg (label text, msg text); grant all on t37_msg to authenticated;
do $$ begin
  begin
    alter table public.listings disable trigger trg_enforce_listing_statements;
    update public.listings set readiness = array['not_a_tick'] where reference_number = 'SELL-TICK-P';
    insert into t37_msg values ('bad', 'ACCEPTED');
  exception when check_violation then insert into t37_msg values ('bad', 'REFUSED'); end;
  alter table public.listings enable trigger trg_enforce_listing_statements;
end $$;
select case when (select msg from t37_msg where label = 'bad') = 'REFUSED' then 'PASS' else 'FAIL' end
  as "T8 a tick value outside the five is refused by the table";

-- Make the statements look 40 days old (trigger stepped aside for the set-up only).
alter table public.listings disable trigger trg_enforce_listing_statements;
update public.listings set truth_confirmed_at = now() - interval '40 days' where reference_number = 'SELL-TICK-P';
alter table public.listings enable trigger trg_enforce_listing_statements;

-- T9: changing only a tick re-dates the statements; saving the same ticks does not.
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000001';
update public.listings set readiness = array['own_available','own_scheduled'], truth_confirmed = true
 where reference_number = 'SELL-TICK-P';
reset role; reset test.uid;
select case when truth_confirmed_at < now() - interval '39 days' then 'PASS' else 'FAIL' end
  as "T9 saving the same ticks leaves the date alone"
from public.listings where reference_number = 'SELL-TICK-P';
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000001';
update public.listings set readiness = array['own_available'], truth_confirmed = true
 where reference_number = 'SELL-TICK-P';
reset role; reset test.uid;
select case when truth_confirmed_at > now() - interval '1 minute' and readiness = array['own_available']
            then 'PASS' else 'FAIL' end
  as "T10 changing a tick re-dates the statements to now (server clock)"
from public.listings where reference_number = 'SELL-TICK-P';

-- T11: changing the role to broker clears the ticks.
set role authenticated; set test.uid='f6f6f6f6-0037-0037-0037-000000000001';
update public.listings set poster_role = 'broker', broker_via = 'principal', truth_confirmed = true
 where reference_number = 'SELL-TICK-P';
reset role; reset test.uid;
select case when readiness is null then 'PASS' else 'FAIL got ' || readiness::text end
  as "T11 changing the role away from Principal clears the ticks"
from public.listings where reference_number = 'SELL-TICK-P';

-- T12: an Operator update cannot change the ticks.
select case when (select readiness from public.listings where reference_number = 'SELL-TICK-T') = array['back_to_back','ex_stock'] then 'PASS' else 'FAIL' end
  as "T12 set-up check: the trader's ticks are in place before the Operator step";
update public.listings set readiness = array['ex_stock'] where reference_number = 'SELL-TICK-T';
select case when readiness = array['back_to_back','ex_stock'] then 'PASS' else 'FAIL got ' || coalesce(readiness::text,'null') end
  as "T13 an update by the server or an Operator leaves the ticks as they were"
from public.listings where reference_number = 'SELL-TICK-T';

-- The revert.
create temp table t37_new as
  select pg_get_functiondef('public.enforce_listing_statements'::regproc) as trig,
         (select proacl::text from pg_proc where oid = 'public.get_public_listings()'::regprocedure) as feed_acl;
\i sql/revert/066_readiness_ticks_revert.sql

select case when (select count(*) from information_schema.columns
                   where table_name = 'listings' and column_name = 'readiness') = 0
            then 'PASS' else 'FAIL' end
  as "T14 after the revert the readiness column is gone";
select case when position('readiness' in pg_get_functiondef('public.enforce_listing_statements'::regproc)) = 0
             and position('reconfirm_listing' in pg_get_functiondef('public.enforce_listing_statements'::regproc)) > 0
            then 'PASS' else 'FAIL' end
  as "T15 after the revert the statements function is the 064 one again (no ticks, still re-confirms)";
select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T16 the statements trigger is still in place after the revert"
from pg_trigger t where t.tgname = 'trg_enforce_listing_statements' and not t.tgisinternal;

\i sql/066_readiness_ticks.sql

select case when pg_get_functiondef('public.enforce_listing_statements'::regproc) = (select trig from t37_new)
            then 'PASS' else 'FAIL' end
  as "T17 after revert and re-apply the function is exactly what 066 first produced";
select case when (select proacl::text from pg_proc where oid = 'public.get_public_listings()'::regprocedure) is not distinct from (select feed_acl from t37_new)
            then 'PASS' else 'FAIL' end
  as "T18 execute rights on the feed are untouched";
\i sql/066_readiness_ticks.sql
select case when pg_get_functiondef('public.enforce_listing_statements'::regproc) = (select trig from t37_new)
            then 'PASS' else 'FAIL' end
  as "T19 applying 066 a second time changes nothing (idempotent)";

-- Leave the suite as it expects.
delete from public.listings where reference_number like '%-TICK-%';
