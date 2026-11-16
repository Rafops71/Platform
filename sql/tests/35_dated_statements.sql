-- 35_dated_statements.sql
--
-- Proves sql/064 and its revert (owner's "dated statements", Option A, 2026-11-16):
--   * Browse's feed returns the date the poster's statements were confirmed (truth_confirmed_at),
--     and still never the truth tick itself;
--   * "Yes, still available" (renew_listing) re-dates the statements to now, and changes no
--     statement;
--   * it re-dates only the owner's own listing, and never a listing that has no statements;
--   * a member cannot set or move the date with an ordinary update, and the renew flag is
--     cleared afterwards;
--   * the revert puts the three functions back (no date in the feed, renew leaves the date
--     alone), and re-applying gives exactly what 064 first produced, with the same grants.
-- The file ends with 064 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== DATED STATEMENTS ==========='

select public.test_invite('dated-a@example.invalid');
select public.test_invite('dated-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('f5f5f5f5-0035-0035-0035-000000000001'::uuid, 'dated-a@example.invalid',
  jsonb_build_object('first_name','Dana','last_name','Dated','phone','+3200003501','country','Chile','language','en')),
 ('f5f5f5f5-0035-0035-0035-000000000002'::uuid, 'dated-b@example.invalid',
  jsonb_build_object('first_name','Boris','last_name','Other','phone','+3200003502','country','Chile','language','en'));
update public.profiles set status = 'approved' where email in ('dated-a@example.invalid','dated-b@example.invalid');
select public.test_sign_approved();

-- Listing 1: posted by member A with statements (the server stamps the date).
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000001';
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                             poster_role, principal_kind, docs_seen, truth_confirmed)
select id, 'sell', 'Dated Copper', 'FOB', 'Chile', 'SELL-DATED-1', 'principal', 'producer', 'yes', true
  from public.profiles where email = 'dated-a@example.invalid';
reset role; reset test.uid;

-- A legacy listing: no statements, no date.
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
select id, 'sell', 'Dated Legacy', 'FOB', 'Chile', 'SELL-DATED-OLD'
  from public.profiles where email = 'dated-a@example.invalid';

-- Make the statements look 40 days old (the trigger is stepped aside for the set-up only).
alter table public.listings disable trigger trg_enforce_listing_statements;
update public.listings set truth_confirmed_at = now() - interval '40 days' where reference_number = 'SELL-DATED-1';
alter table public.listings enable trigger trg_enforce_listing_statements;

create temp table t35_before as
  select truth_confirmed_at as d, poster_role, principal_kind, docs_seen, updated_at
    from public.listings where reference_number = 'SELL-DATED-1';
grant all on t35_before to authenticated;
create temp table t35_new as
  select (select pg_get_functiondef('public.enforce_listing_statements'::regproc)) as trig,
         (select pg_get_functiondef('public.renew_listing(uuid)'::regprocedure)) as ren,
         (select pg_get_functiondef('public.get_public_listings()'::regprocedure)) as feed,
         (select proacl::text from pg_proc where oid = 'public.get_public_listings()'::regprocedure) as feed_acl,
         (select proacl::text from pg_proc where oid = 'public.renew_listing(uuid)'::regprocedure) as ren_acl;

-- T1/T2: what Browse's feed carries.
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000002';
select case when (select truth_confirmed_at from public.get_public_listings() where reference_number = 'SELL-DATED-1')
                  = (select d from t35_before)
            then 'PASS' else 'FAIL' end
  as "T1 Browse's feed returns the date the statements were confirmed";
select case when (select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
                   where json_object_keys in ('truth_confirmed','has_mandate','mandate_date','broker_via','docs_showable')) = 0
            then 'PASS' else 'FAIL' end
  as "T2 the feed still never carries the truth tick, the mandate or the chain";
reset role; reset test.uid;

-- T3: a member cannot move the date with an ordinary update (no statement changed).
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000001';
update public.listings set truth_confirmed_at = now() where reference_number = 'SELL-DATED-1';
reset role; reset test.uid;
select case when truth_confirmed_at = (select d from t35_before) then 'PASS' else 'FAIL' end
  as "T3 a member cannot set the date with an ordinary update"
from public.listings where reference_number = 'SELL-DATED-1';

-- T4: another member cannot re-date it.
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000002';
create temp table t35_msg (label text, msg text); grant all on t35_msg to authenticated;
do $$ begin
  begin perform public.renew_listing((select id from public.listings where reference_number = 'SELL-DATED-1'));
        insert into t35_msg values ('other', 'ACCEPTED');
  exception when others then insert into t35_msg values ('other', sqlerrm); end;
end $$;
reset role; reset test.uid;
select case when (select msg from t35_msg where label = 'other') = 'Listing not found, or not yours'
             and (select truth_confirmed_at from public.listings where reference_number = 'SELL-DATED-1') = (select d from t35_before)
            then 'PASS' else 'FAIL got ' || (select msg from t35_msg where label = 'other') end
  as "T4 another member cannot renew, or re-date, someone else's listing";

-- T5: the owner presses "Yes, still available".
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000001';
select public.renew_listing((select id from public.listings where reference_number = 'SELL-DATED-1'));
select public.renew_listing((select id from public.listings where reference_number = 'SELL-DATED-OLD'));
reset role; reset test.uid;
select case when l.truth_confirmed_at > now() - interval '1 minute'
             and l.updated_at > b.updated_at
             and (l.poster_role, l.principal_kind, l.docs_seen) is not distinct from (b.poster_role, b.principal_kind, b.docs_seen)
            then 'PASS' else 'FAIL d=' || l.truth_confirmed_at::text || ' now=' || now()::text || ' u=' || l.updated_at::text || ' bu=' || b.updated_at::text end
  as "T5 'Yes, still available' re-dates the statements to now and changes none of them"
from public.listings l, t35_before b where l.reference_number = 'SELL-DATED-1';

select case when truth_confirmed_at is null and poster_role is null then 'PASS' else 'FAIL' end
  as "T6 renewing a listing that never had statements gives it none"
from public.listings where reference_number = 'SELL-DATED-OLD';

select case when coalesce(current_setting('myplatform.reconfirm_listing', true), '') = '' then 'PASS' else 'FAIL' end
  as "T7 the renew flag is cleared once renew_listing has finished";

-- T8: after the renew, an ordinary update still cannot move the date.
alter table public.listings disable trigger trg_enforce_listing_statements;
update public.listings set truth_confirmed_at = now() - interval '40 days' where reference_number = 'SELL-DATED-1';
alter table public.listings enable trigger trg_enforce_listing_statements;
set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000001';
update public.listings set truth_confirmed_at = now() where reference_number = 'SELL-DATED-1';
reset role; reset test.uid;
select case when truth_confirmed_at < now() - interval '39 days' then 'PASS' else 'FAIL' end
  as "T8 after a renew, an ordinary update still cannot move the date"
from public.listings where reference_number = 'SELL-DATED-1';

-- The revert.
\i sql/revert/064_dated_statements_revert.sql

select case when (select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
                   where json_object_keys = 'truth_confirmed_at') = 0
            then 'PASS' else 'FAIL' end
  as "T9 after the revert the feed carries no date again";

set role authenticated; set test.uid='f5f5f5f5-0035-0035-0035-000000000001';
select public.renew_listing((select id from public.listings where reference_number = 'SELL-DATED-1'));
reset role; reset test.uid;
select case when truth_confirmed_at < now() - interval '39 days' then 'PASS' else 'FAIL' end
  as "T10 after the revert 'still available' leaves the date alone, as before"
from public.listings where reference_number = 'SELL-DATED-1';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T11 the statements trigger is still in place after the revert"
from pg_trigger t where t.tgname = 'trg_enforce_listing_statements' and not t.tgisinternal;

\i sql/064_dated_statements.sql

select case when (select pg_get_functiondef('public.enforce_listing_statements'::regproc)) = (select trig from t35_new)
             and (select pg_get_functiondef('public.renew_listing(uuid)'::regprocedure)) = (select ren from t35_new)
             and (select pg_get_functiondef('public.get_public_listings()'::regprocedure)) = (select feed from t35_new)
            then 'PASS' else 'FAIL trig=' || ((select pg_get_functiondef('public.enforce_listing_statements'::regproc)) = (select trig from t35_new))::text || ' ren=' || ((select pg_get_functiondef('public.renew_listing(uuid)'::regprocedure)) = (select ren from t35_new))::text || ' feed=' || ((select pg_get_functiondef('public.get_public_listings()'::regprocedure)) = (select feed from t35_new))::text end
  as "T12 after revert and re-apply the three functions are exactly what 064 first produced";

select case when (select proacl::text from pg_proc where oid = 'public.get_public_listings()'::regprocedure) is not distinct from (select feed_acl from t35_new)
             and (select proacl::text from pg_proc where oid = 'public.renew_listing(uuid)'::regprocedure) is not distinct from (select ren_acl from t35_new)
            then 'PASS' else 'FAIL' end
  as "T13 execute rights on the feed and on renew are the same after revert and re-apply";

\i sql/064_dated_statements.sql
select case when (select pg_get_functiondef('public.get_public_listings()'::regprocedure)) = (select feed from t35_new)
             and (select pg_get_functiondef('public.enforce_listing_statements'::regproc)) = (select trig from t35_new)
            then 'PASS' else 'FAIL' end
  as "T14 applying 064 a second time changes nothing (idempotent)";

-- Leave the suite as it expects.
delete from public.listings where reference_number in ('SELL-DATED-1','SELL-DATED-OLD');
