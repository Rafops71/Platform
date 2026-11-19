-- 40_translate.sql
--
-- Proves sql/069 and its revert (Translate, owner 19 Nov 2026; docs/AGREED-2026-11-19-translate.md):
--   * get_listing_texts() hands over exactly the three free-text fields of ONE listing, to the same people who
--     may use Browse: an approved member who has signed the current Terms; not a pending member, not an
--     approved member who has not signed, not a stranger; an archived listing is hidden unless it is the
--     caller's own; an unknown listing returns nothing;
--   * the cache, the hourly counts and the daily units are touched by no member and no stranger (no grant,
--     row-level security on, no policy), and the counters are callable only by the service role;
--   * the hourly limit is exact (the 4th press in a limit of 3 is refused, a release gives one back);
--   * the daily units stop exactly at the cap, members and Operator counted apart, releases give units back;
--   * a cached translation goes with its listing (on delete cascade);
--   * the hourly count holds no listing id: nothing records which member looked at which listing;
--   * the revert drops the five new objects, re-applying gives exactly what 069 first produced, and applying
--     twice is harmless.
-- Ends with 069 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== TRANSLATE ==========='

-- Members: A posts, B reads, P is pending, U is approved but has NOT signed the current Terms.
select public.test_invite('tr-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('40404040-0040-4040-8040-00000000000a'::uuid, 'tr-a@example.invalid',
        jsonb_build_object('first_name', 'Ana', 'last_name', 'Poster'));
select public.test_invite('tr-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('40404040-0040-4040-8040-00000000000b'::uuid, 'tr-b@example.invalid',
        jsonb_build_object('first_name', 'Beto', 'last_name', 'Reader'));
select public.test_invite('tr-p@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('40404040-0040-4040-8040-00000000000c'::uuid, 'tr-p@example.invalid',
        jsonb_build_object('first_name', 'Pia', 'last_name', 'Pending'));
update public.profiles set status = 'approved' where email in ('tr-a@example.invalid', 'tr-b@example.invalid');
select public.test_sign_approved();   -- A and B sign the newest Terms
select public.test_invite('tr-u@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('40404040-0040-4040-8040-00000000000d'::uuid, 'tr-u@example.invalid',
        jsonb_build_object('first_name', 'Uli', 'last_name', 'Unsigned'));
update public.profiles set status = 'approved' where email = 'tr-u@example.invalid';   -- after the signing: unsigned

select case when exists (select 1 from public.terms_versions) then 'PASS' else 'FAIL no Terms version exists, so the unsigned case below proves nothing' end
  as "T0 a published Terms version exists, so 'has not signed' can really be refused";

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number, specification, price_conditions, notes)
select id, 'sell', 'Translate Copper', 'FOB', 'Chile', 'SELL-TR-1',
       'Concentrado de cobre, 28% Cu mínimo', 'Precio firme 48 horas', 'Embarque en marzo'
  from public.profiles where email = 'tr-a@example.invalid';
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number, specification, status)
select id, 'sell', 'Translate Zinc', 'FOB', 'Chile', 'SELL-TR-ARCH', 'archived text', 'archived'
  from public.profiles where email = 'tr-a@example.invalid';

create temp table t40_ids as select reference_number as ref, id from public.listings where reference_number in ('SELL-TR-1', 'SELL-TR-ARCH');
grant all on t40_ids to authenticated;   -- a member cannot select another member's listing, so the ids are looked up once, here
create temp table t40_result (name text, ok boolean);
grant all on t40_result to authenticated;
create temp table t40_before as
  select pg_get_functiondef('public.get_listing_texts(uuid)'::regprocedure) as g,
         pg_get_functiondef('public.translate_take_member_slot(uuid,integer)'::regprocedure) as t,
         pg_get_functiondef('public.translate_reserve_budget(text,numeric,numeric)'::regprocedure) as r;

-- T1/T2: an approved member who has signed reads another member's listing text, and only these three fields.
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000b';
select case when (select specification from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1'))) = 'Concentrado de cobre, 28% Cu mínimo'
             and (select price_conditions from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1'))) = 'Precio firme 48 horas'
             and (select notes from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1'))) = 'Embarque en marzo'
            then 'PASS' else 'FAIL' end
  as "T1 an approved member who has signed the Terms reads the three free-text fields of another member's listing";
select case when (select count(*) from json_object_keys(to_json((select f from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1')) f)))) = 3
            then 'PASS' else 'FAIL' end
  as "T2 it returns exactly three fields: no poster, no reference, nothing else";
reset role; reset "test.uid";

-- T3/T4: a pending member and an approved member who has not signed are refused (42501), and nothing is returned.
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000c';
do $$ begin
  begin perform * from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1'));
        insert into t40_result values ('pending', true);
  exception when sqlstate '42501' then insert into t40_result values ('pending', false); end;
end $$;
reset role; reset "test.uid";
select case when (select ok from t40_result where name = 'pending') = false then 'PASS' else 'FAIL' end
  as "T3 a pending member is refused";
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000d';
do $$ begin
  begin perform * from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-1'));
        insert into t40_result values ('unsigned', true);
  exception when sqlstate '42501' then insert into t40_result values ('unsigned', false); end;
end $$;
reset role; reset "test.uid";
select case when (select ok from t40_result where name = 'unsigned') = false then 'PASS' else 'FAIL' end
  as "T4 Item62 an approved member who has not signed the current Terms is refused, as Browse refuses them";

-- T5: who may call it.
select case when has_function_privilege('authenticated', 'public.get_listing_texts(uuid)', 'execute')
              and not has_function_privilege('anon', 'public.get_listing_texts(uuid)', 'execute')
            then 'PASS' else 'FAIL' end
  as "T5 a signed-in caller may call get_listing_texts and a stranger may not";

-- T6/T7: archived is hidden from others, shown to its owner; an unknown listing returns nothing.
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000b';
select case when (select count(*) from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-ARCH'))) = 0
             and (select count(*) from public.get_listing_texts('00000000-0000-4000-8000-000000000000'::uuid)) = 0
            then 'PASS' else 'FAIL' end
  as "T6 an archived listing and an unknown listing return nothing to another member";
reset role; reset "test.uid";
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000a';
select case when (select count(*) from public.get_listing_texts((select id from t40_ids where ref = 'SELL-TR-ARCH'))) = 1
            then 'PASS' else 'FAIL' end
  as "T7 the owner can still read their own archived listing";
reset role; reset "test.uid";

-- T8: the three new tables are nobody's but the service role's.
select case when not exists (
         select 1 from (values ('public.listing_translations'), ('public.member_translate_usage'), ('public.translate_daily_budget')) t(n)
          cross join (values ('anon'), ('authenticated')) r(role)
          cross join (values ('select'), ('insert'), ('update'), ('delete')) p(priv)
         where has_table_privilege(r.role, t.n, p.priv))
            then 'PASS' else 'FAIL' end
  as "T8 no stranger and no member holds any right on the cache, the hourly counts or the daily units";
select case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname in ('listing_translations','member_translate_usage','translate_daily_budget')
                     and c.relrowsecurity) = 3
             and not exists (select 1 from pg_policies where schemaname = 'public'
                              and tablename in ('listing_translations','member_translate_usage','translate_daily_budget'))
            then 'PASS' else 'FAIL' end
  as "T9 row-level security is on for all three and there is no policy: nothing can be read by accident";
set role authenticated; set "test.uid" = '40404040-0040-4040-8040-00000000000b';
do $$ begin
  begin perform count(*) from public.listing_translations;
        insert into t40_result values ('cache', true);
  exception when insufficient_privilege then insert into t40_result values ('cache', false); end;
end $$;
reset role; reset "test.uid";
select case when (select ok from t40_result where name = 'cache') = false then 'PASS' else 'FAIL' end
  as "T10 a member who tries to read the cache is refused";

-- T11: the counters are the service role's alone.
select case when has_function_privilege('service_role', 'public.translate_take_member_slot(uuid,integer)', 'execute')
              and has_function_privilege('service_role', 'public.translate_reserve_budget(text,numeric,numeric)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_take_member_slot(uuid,integer)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_reserve_budget(text,numeric,numeric)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_release_member_slot(uuid)', 'execute')
              and not has_function_privilege('authenticated', 'public.translate_release_budget(text,numeric)', 'execute')
              and not has_function_privilege('anon', 'public.translate_take_member_slot(uuid,integer)', 'execute')
            then 'PASS' else 'FAIL' end
  as "T11 only the service role can call the four counters";

-- T12: the hourly limit is exact (limit 3 here; the Edge Function passes the owner's 30).
select public.translate_take_member_slot(id, 3) as r1 into temp t40_s1 from public.profiles where email = 'tr-b@example.invalid';
select public.translate_take_member_slot(id, 3) as r2 into temp t40_s2 from public.profiles where email = 'tr-b@example.invalid';
select public.translate_take_member_slot(id, 3) as r3 into temp t40_s3 from public.profiles where email = 'tr-b@example.invalid';
select public.translate_take_member_slot(id, 3) as r4 into temp t40_s4 from public.profiles where email = 'tr-b@example.invalid';
select case when (select r1 and r2 and r3 and not r4 from t40_s1, t40_s2, t40_s3, t40_s4) then 'PASS' else 'FAIL' end
  as "T12 the first three presses in a limit of three are allowed and the fourth is refused";
select public.translate_release_member_slot(id) from public.profiles where email = 'tr-b@example.invalid';
select case when public.translate_take_member_slot((select id from public.profiles where email = 'tr-b@example.invalid'), 3)
             and not public.translate_take_member_slot((select id from public.profiles where email = 'tr-b@example.invalid'), 3)
            then 'PASS' else 'FAIL' end
  as "T13 a release gives exactly one press back";
select case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'member_translate_usage'
                     and column_name in ('profile_id', 'hour_start', 'listings')) = 3
             and (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'member_translate_usage') = 3
            then 'PASS' else 'FAIL' end
  as "T14 the hourly count holds a member, an hour and a number: no listing, nothing about what they looked at";

-- T15/T16: the daily units stop exactly at the cap; members and Operator are counted apart.
select case when public.translate_reserve_budget('member', 5000, 6000)
             and not public.translate_reserve_budget('member', 1500, 6000)
             and public.translate_reserve_budget('member', 1000, 6000)
             and not public.translate_reserve_budget('member', 1, 6000)
            then 'PASS' else 'FAIL' end
  as "T15 the members' daily units stop exactly at the cap, and a refused request adds nothing";
select case when public.translate_reserve_budget('operator', 4000, 4000)
             and not public.translate_reserve_budget('operator', 1, 4000)
             and (select member_units from public.translate_daily_budget where day = (now() at time zone 'utc')::date) = 6000
            then 'PASS' else 'FAIL' end
  as "T16 the Operator's units are counted apart: full Operator units leave the members' count where it was";
select public.translate_release_budget('member', 1000);
select case when public.translate_reserve_budget('member', 500, 6000) and not public.translate_reserve_budget('member', 600, 6000)
            then 'PASS' else 'FAIL' end
  as "T17 released units can be used again, and only those";
do $$ begin
  begin perform public.translate_reserve_budget('everyone', 1, 6000);
        insert into t40_result values ('kind', true);
  exception when sqlstate '22023' then insert into t40_result values ('kind', false); end;
end $$;
select case when (select ok from t40_result where name = 'kind') = false then 'PASS' else 'FAIL' end
  as "T18 an unknown kind of use is refused";

-- T19: a cached translation goes with its listing.
insert into public.listing_translations (listing_id, field, target_lang, source_hash, translated_text)
select id, 'notes', 'en', 'hash-1', 'Shipment in March' from public.listings where reference_number = 'SELL-TR-1';
select case when (select count(*) from public.listing_translations) = 1 then 'PASS' else 'FAIL' end
  as "T19a a translation can be cached for a listing";
delete from public.listings where reference_number = 'SELL-TR-1';
select case when (select count(*) from public.listing_translations) = 0 then 'PASS' else 'FAIL' end
  as "T19 deleting a listing removes its cached translations";

-- The revert.
\i sql/revert/069_translate_revert.sql
select case when to_regclass('public.listing_translations') is null
             and to_regclass('public.member_translate_usage') is null
             and to_regclass('public.translate_daily_budget') is null
             and to_regprocedure('public.get_listing_texts(uuid)') is null
             and to_regprocedure('public.translate_take_member_slot(uuid,integer)') is null
             and to_regprocedure('public.translate_reserve_budget(text,numeric,numeric)') is null
             and to_regprocedure('public.translate_release_member_slot(uuid)') is null
             and to_regprocedure('public.translate_release_budget(text,numeric)') is null
            then 'PASS' else 'FAIL' end
  as "T20 the revert drops all three tables and all five functions";
select case when exists (select 1 from public.listings where reference_number = 'SELL-TR-ARCH')
             and exists (select 1 from public.profiles where email = 'tr-a@example.invalid')
            then 'PASS' else 'FAIL' end
  as "T21 the revert touches no listing and no member";

\i sql/069_translate.sql
select case when pg_get_functiondef('public.get_listing_texts(uuid)'::regprocedure) = (select g from t40_before)
             and pg_get_functiondef('public.translate_take_member_slot(uuid,integer)'::regprocedure) = (select t from t40_before)
             and pg_get_functiondef('public.translate_reserve_budget(text,numeric,numeric)'::regprocedure) = (select r from t40_before)
            then 'PASS' else 'FAIL' end
  as "T22 after revert and re-apply the functions are exactly what 069 first produced";
\i sql/069_translate.sql
select case when to_regclass('public.listing_translations') is not null
             and pg_get_functiondef('public.get_listing_texts(uuid)'::regprocedure) = (select g from t40_before)
            then 'PASS' else 'FAIL' end
  as "T23 applying 069 a second time changes nothing (idempotent)";

delete from public.listings where reference_number = 'SELL-TR-ARCH';
