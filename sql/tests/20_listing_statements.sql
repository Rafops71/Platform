-- 20_listing_statements.sql
--
-- Proves sql/033: a member cannot publish without saying their role, both
-- document answers and the truth tick; the owner's two-degrees rule is
-- enforced; the tick's time is the server's; Browse shows the role and the
-- documents line and never the mandate or the chain.

\set QUIET on
\pset pager off

\echo
\echo '=========== WHAT A POSTER MUST SAY ==========='

select public.test_invite('stmt-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('c2c2c2c2-0001-0001-0001-000000000001'::uuid, 'stmt-member@example.invalid',
  jsonb_build_object('first_name','Stella','last_name','Statement','phone','+3200000201',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email = 'stmt-member@example.invalid';
select public.test_sign_approved();

create temp table t20 (label text, msg text);
grant all on t20 to authenticated;

-- Each attempt runs as the member and records the refusal's own words.
set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
do $$
declare
  me uuid := (select id from public.profiles where email = 'stmt-member@example.invalid');

begin
  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-1', 'yes', 'on_request', true);
    insert into t20 values ('no role', 'ACCEPTED');
  exception when others then insert into t20 values ('no role', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, broker_via, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-2', 'broker', 'further', 'yes', 'on_request', true);
    insert into t20 values ('too far', 'ACCEPTED');
  exception when others then insert into t20 values ('too far', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-3', 'broker', 'yes', 'on_request', true);
    insert into t20 values ('broker no chain', 'ACCEPTED');
  exception when others then insert into t20 values ('broker no chain', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, has_mandate, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-4', 'mandated', false, 'yes', 'on_request', true);
    insert into t20 values ('no mandate', 'ACCEPTED');
  exception when others then insert into t20 values ('no mandate', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-5', 'principal', 'producer', 'yes', true);
    insert into t20 values ('one docs answer', 'ACCEPTED');
  exception when others then insert into t20 values ('one docs answer', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, docs_showable)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-6', 'principal', 'producer', 'yes', 'on_request');
    insert into t20 values ('no tick', 'ACCEPTED');
  exception when others then insert into t20 values ('no tick', sqlerrm); end;
end $$;

-- The valid ones. A browser-supplied time and stray chain details are sent
-- on purpose: both must be overwritten.
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, principal_kind, broker_via, has_mandate, docs_seen, docs_showable,
                             truth_confirmed, truth_confirmed_at)
select id, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-OK', 'principal', 'trader', 'one_broker', true,
       'source_says', 'after_agreement', true, '2001-01-01'
  from public.profiles where email = 'stmt-member@example.invalid';

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, has_mandate, mandate_date, docs_seen, docs_showable, truth_confirmed)
select id, 'sell', 'Stmt Cobalt', 'FOB', 'Chile', 'SELL-STMT-MAND', 'mandated', true, '2026-09-01',
       'yes', 'on_request', true
  from public.profiles where email = 'stmt-member@example.invalid';
reset role; reset test.uid;

select case when count(*) = 6 and bool_and(msg <> 'ACCEPTED') then 'PASS'
            else 'FAIL ' || string_agg(label || ': ' || msg, '; ') end
  as "T1 Item66 no role, chain, mandate, documents answer or tick: refused"
from t20 where label in ('no role','broker no chain','no mandate','one docs answer','no tick','too far');

select case when msg = 'Jericho accepts offers no more than two steps from the principal. Please post only offers within that distance.'
            then 'PASS' else 'FAIL got ' || msg end
  as "T2 Item67 an offer further than two steps is refused in the owner's words"
from t20 where label = 'too far';

select case when msg like 'Without a signed mandate you act as a broker%' then 'PASS' else 'FAIL got ' || msg end
  as "T3 no signed mandate is told to post as a broker"
from t20 where label = 'no mandate';

select case when truth_confirmed_at > now() - interval '5 minutes' and truth_confirmed = false
             and broker_via is null and has_mandate is null
            then 'PASS' else 'FAIL at ' || coalesce(truth_confirmed_at::text, 'null') end
  as "T4 Item69 the tick is stamped with the server's time, stray details dropped"
from public.listings where reference_number = 'SELL-STMT-OK';

select case when has_mandate and mandate_date = '2026-09-01' then 'PASS' else 'FAIL' end
  as "T5 a mandated intermediary's mandate and its date are kept"
from public.listings where reference_number = 'SELL-STMT-MAND';

\echo
\echo '=========== EDITING ==========='

-- Nobody, the server included, can set the time by hand (an Operator could
-- otherwise backdate a member's confirmation), so the time is noted instead.
create temp table t20_time as
  select truth_confirmed_at as at from public.listings where reference_number = 'SELL-STMT-OK';

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
update public.listings set status = 'under_review' where reference_number = 'SELL-STMT-OK';
reset role; reset test.uid;

select case when truth_confirmed_at = (select at from t20_time) and status = 'under_review' then 'PASS'
            else 'FAIL ' || status || ' ' || truth_confirmed_at end
  as "T6 a status-only change is not a new statement"
from public.listings where reference_number = 'SELL-STMT-OK';

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
update public.listings set notes = 'changed without ticking' where reference_number = 'SELL-STMT-OK';
reset role; reset test.uid;

select case when notes is null then 'PASS' else 'FAIL edited' end
  as "T7 Item69 changing what a listing says needs the tick again"
from public.listings where reference_number = 'SELL-STMT-OK';

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
update public.listings set notes = 'changed and ticked', truth_confirmed = true
 where reference_number = 'SELL-STMT-OK';
reset role; reset test.uid;

select case when notes = 'changed and ticked' and truth_confirmed_at > (select at from t20_time)
            then 'PASS' else 'FAIL' end
  as "T8 a ticked edit is saved with a fresh time"
from public.listings where reference_number = 'SELL-STMT-OK';

\echo
\echo '=========== WHAT BROWSE SHOWS ==========='

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
select case when
    (select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
      where json_object_keys in ('poster_role','docs_seen')) = 2
  and (select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
      where json_object_keys in ('has_mandate','mandate_date','broker_via','docs_showable','truth_confirmed_at')) = 0
  then 'PASS' else 'FAIL' end
  as "T9 Item68 Browse shows role and documents, never mandate or chain";

select case when poster_role = 'mandated' and docs_seen = 'yes' then 'PASS' else 'FAIL' end
  as "T10 Browse carries the poster's stated role"
from public.get_public_listings() where reference_number = 'SELL-STMT-MAND';
reset role; reset test.uid;

-- A row written by the server, as every listing before 033 was: blank, and
-- shown as "Not stated", never filled in by a guess.
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
select id, 'sell', 'Stmt Legacy', 'FOB', 'Chile', 'SELL-STMT-OLD'
  from public.profiles where email = 'stmt-member@example.invalid';

select case when poster_role is null and docs_seen is null and truth_confirmed_at is null
            then 'PASS' else 'FAIL' end
  as "T11 a listing from before this stays blank, not guessed"
from public.listings where reference_number = 'SELL-STMT-OLD';

\echo
\echo '=========== PRODUCER OR TRADER (sql/043) ==========='

create temp table t20k (label text, msg text);
grant all on t20k to authenticated;

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
do $$
declare
  me uuid := (select id from public.profiles where email = 'stmt-member@example.invalid');
begin
  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-K1', 'principal', 'yes', 'on_request', true);
    insert into t20k values ('sell no kind', 'ACCEPTED');
  exception when others then insert into t20k values ('sell no kind', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-K2', 'principal', 'dealer', 'yes', 'on_request', true);
    insert into t20k values ('sell bad kind', 'ACCEPTED');
  exception when others then insert into t20k values ('sell bad kind', 'refused'); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, destination, reference_number,
                                 poster_role, principal_kind, docs_seen, docs_showable, truth_confirmed)
    values (me, 'buy', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-K3', 'principal', 'trader', 'yes', 'on_request', true);
    insert into t20k values ('buy kind', 'ACCEPTED');
  exception when others then insert into t20k values ('buy kind', sqlerrm); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, broker_via, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-K4', 'broker', 'trader', 'one_broker', 'yes', 'on_request', true);
    insert into t20k values ('broker kind', 'ACCEPTED');
  exception when others then insert into t20k values ('broker kind', 'refused'); end;

  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Stmt Copper', 'FOB', 'Chile', 'SELL-STMT-K5', 'principal', 'trader', 'yes', 'on_request', true);
    insert into t20k values ('sell trader', 'ACCEPTED');
  exception when others then insert into t20k values ('sell trader', sqlerrm); end;
end $$;
reset role; reset test.uid;

select case when msg = 'Please say whether you are a producer or a trader.' then 'PASS' else 'FAIL got ' || msg end
  as "T12 a principal's Sell offer without Producer or Trader is refused"
from t20k where label = 'sell no kind';

select case when msg = 'refused' then 'PASS' else 'FAIL got ' || msg end
  as "T13 a value other than producer or trader is refused"
from t20k where label = 'sell bad kind';

select case when (select msg from t20k where label = 'buy kind') = 'ACCEPTED'
             and (select principal_kind is null from public.listings where reference_number = 'SELL-STMT-K3')
            then 'PASS' else 'FAIL' end
  as "T14 a Buy request never carries Producer or Trader";

select case when (select msg from t20k where label = 'broker kind') = 'ACCEPTED'
             and (select principal_kind is null from public.listings where reference_number = 'SELL-STMT-K4')
            then 'PASS' else 'FAIL' end
  as "T15 a broker's Sell offer never carries Producer or Trader";

set role authenticated; set test.uid='c2c2c2c2-0001-0001-0001-000000000001';
select case when principal_kind = 'trader' then 'PASS' else 'FAIL got ' || coalesce(principal_kind, 'null') end
  as "T16 Browse carries a principal's Producer or Trader on a Sell offer"
from public.get_public_listings() where reference_number = 'SELL-STMT-K5';
reset role; reset test.uid;

delete from public.listings where reference_number like 'SELL-STMT-%';
