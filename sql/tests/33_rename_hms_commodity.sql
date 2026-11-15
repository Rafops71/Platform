-- 33_rename_hms_commodity.sql
--
-- Proves sql/062 and its revert (owner's decision 2026-11-15: the commodity "HMS 1&2 Scrap" is
-- now "HMS 1&2 (80:20)", renamed everywhere, because listings and saved searches store the
-- commodity by name):
--   * the commodity-list row is renamed, keeping its id and sort order;
--   * listings and saved searches that carry the old name follow, and nothing else changes;
--   * a renamed listing keeps its updated_at (a stale listing does not look freshly confirmed);
--   * re-matching does not run: no new match rows and no new notifications to the Operator;
--   * the two triggers switched off for the rename are on again afterwards;
--   * the rename is recorded in the activity log as an edit of each renamed listing;
--   * applying it again changes nothing; the revert puts the old name back everywhere, with the
--     same care; and a list row that already has the new name does not break the migration.
-- The migration and its revert are run from their own files (\i). The file ends with the
-- migration applied and its fixtures removed, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE HMS COMMODITY RENAME ==========='

-- Where the suite's setup leaves us: the commodity is already named the new way.
create temp table t33_row as
  select id, sort_order from public.commodities where name = 'HMS 1&2 (80:20)';

select case when (select count(*) from t33_row) = 1
             and not exists (select 1 from public.commodities where name = 'HMS 1&2 Scrap')
            then 'PASS' else 'FAIL' end
  as "T0 setup: one commodity named HMS 1&2 (80:20), none named HMS 1&2 Scrap";

\i sql/revert/062_rename_hms_commodity_revert.sql

select case when exists (select 1 from public.commodities c join t33_row r using (id) where c.name = 'HMS 1&2 Scrap')
            then 'PASS' else 'FAIL' end
  as "T1 the revert gives the list row its old name back, same id";

-- Fixtures: an approved member and Operator, listings and saved searches under the old name.
select public.test_invite('hms-owner@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
('f3f30001-0001-0001-0001-000000000001'::uuid, 'hms-owner@example.invalid',
 jsonb_build_object('first_name','Hans','last_name','Steel','phone','+3200003301','country','Chile','language','en'));
select public.test_invite('hms-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
('f3f30002-0002-0002-0002-000000000002'::uuid, 'hms-op@example.invalid',
 jsonb_build_object('first_name','Olga','last_name','Desk','phone','+3200003302','country','Chile','language','en'));
update public.profiles set status = 'approved' where email in ('hms-owner@example.invalid', 'hms-op@example.invalid');
update public.profiles set role = 'operator' where email = 'hms-op@example.invalid';

-- Two opposite-side listings under the old name (a match pair), both 40 days stale, and one
-- listing under another commodity, which must not change.
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, updated_at)
select p.id, 'sell', 'HMS 1&2 Scrap', 1000, 'Metric tons', 'FOB', 'Rotterdam', 'available',
       public.next_reference('sell'), now() - interval '40 days'
  from public.profiles p where p.email = 'hms-owner@example.invalid';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination, status, reference_number, updated_at)
select p.id, 'buy', 'HMS 1&2 Scrap', 900, 'Metric tons', 'FOB', 'Rotterdam', 'available',
       public.next_reference('buy'), now() - interval '40 days'
  from public.profiles p where p.email = 'hms-owner@example.invalid';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number, updated_at)
select p.id, 'sell', 'Iron Ore', 500, 'Metric tons', 'CIF', 'Santos', 'available',
       public.next_reference('sell'), now() - interval '40 days'
  from public.profiles p where p.email = 'hms-owner@example.invalid';
insert into public.saved_searches (user_id, commodity, listing_type)
select p.id, 'HMS 1&2 Scrap', 'sell' from public.profiles p where p.email = 'hms-owner@example.invalid';
insert into public.saved_searches (user_id, commodity, listing_type)
select p.id, 'Iron Ore', 'sell' from public.profiles p where p.email = 'hms-owner@example.invalid';

create temp table t33_before as
  select l.id, l.commodity, l.reference_number, l.user_id, l.quantity, l.updated_at
    from public.listings l where l.user_id = (select id from public.profiles where email = 'hms-owner@example.invalid');
create temp table t33_counts as
  select (select count(*) from public.matches) as matches,
         (select count(*) from public.notifications where type = 'match_found') as notes,
         (select count(*) from public.activity_log where action = 'listing_edited') as edits;

select case when (select count(*) from t33_before where commodity = 'HMS 1&2 Scrap') = 2
             and (select matches from t33_counts) >= 1 and (select notes from t33_counts) >= 1
            then 'PASS' else 'FAIL' end
  as "T2 setup: two listings under the old name, a match between them and an Operator notification";

\i sql/062_rename_hms_commodity.sql

select case when (select count(*) from public.commodities where name = 'HMS 1&2 (80:20)') = 1
             and not exists (select 1 from public.commodities where name = 'HMS 1&2 Scrap')
             and exists (select 1 from public.commodities c join t33_row r on r.id = c.id
                          where c.name = 'HMS 1&2 (80:20)' and c.sort_order is not distinct from r.sort_order)
            then 'PASS' else 'FAIL' end
  as "T3 the list row is renamed, keeping its id and its sort order";

select case when count(*) = 2 and bool_and(l.commodity = 'HMS 1&2 (80:20)'
              and l.reference_number = b.reference_number and l.user_id = b.user_id and l.quantity = b.quantity)
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 the two listings carry the new name and nothing else about them changed"
from public.listings l join t33_before b using (id) where b.commodity = 'HMS 1&2 Scrap';

select case when count(*) = 3 and bool_and(l.updated_at = b.updated_at)
            then 'PASS' else 'FAIL' end
  as "T5 no listing's updated_at moved: a stale listing does not look freshly confirmed"
from public.listings l join t33_before b using (id);

select case when (select commodity from public.listings where id = (select id from t33_before where commodity = 'Iron Ore')) = 'Iron Ore'
            then 'PASS' else 'FAIL' end
  as "T6 a listing under another commodity is untouched";

select case when exists (select 1 from public.saved_searches where commodity = 'HMS 1&2 (80:20)' and listing_type = 'sell')
             and not exists (select 1 from public.saved_searches where commodity = 'HMS 1&2 Scrap')
             and exists (select 1 from public.saved_searches where commodity = 'Iron Ore')
            then 'PASS' else 'FAIL' end
  as "T7 the saved search follows the rename and the other saved search is untouched";

select case when (select count(*) from public.matches) = (select matches from t33_counts)
             and (select count(*) from public.notifications where type = 'match_found') = (select notes from t33_counts)
            then 'PASS' else 'FAIL' end
  as "T8 no re-matching: no new match rows and no new Operator notifications";

select case when (select count(*) from public.activity_log where action = 'listing_edited') = (select edits from t33_counts) + 2
            then 'PASS' else 'FAIL got ' || ((select count(*) from public.activity_log where action = 'listing_edited') - (select edits from t33_counts)) end
  as "T9 the rename is recorded: one listing_edited line for each of the two renamed listings";

select case when (select count(*) from pg_trigger t where t.tgrelid = 'public.listings'::regclass
                   and t.tgname in ('trg_protect_listing_columns', 'on_listing_matchable') and t.tgenabled = 'O') = 2
            then 'PASS' else 'FAIL' end
  as "T10 the two triggers switched off for the rename are on again";

-- Again: nothing more to rename.
create temp table t33_once_l as select id, commodity, updated_at from public.listings;
create temp table t33_once_c as select id, name, sort_order from public.commodities;
create temp table t33_once_n as select (select count(*) from public.activity_log) as log;

\i sql/062_rename_hms_commodity.sql

select case when not exists ((select * from t33_once_l except select id, commodity, updated_at from public.listings)
                              union all (select id, commodity, updated_at from public.listings except select * from t33_once_l))
             and not exists ((select * from t33_once_c except select id, name, sort_order from public.commodities)
                              union all (select id, name, sort_order from public.commodities except select * from t33_once_c))
             and (select count(*) from public.activity_log) = (select log from t33_once_n)
            then 'PASS' else 'FAIL' end
  as "T11 applying the migration a second time changes nothing (idempotent)";

-- Revert, with the same care.
\i sql/revert/062_rename_hms_commodity_revert.sql

select case when exists (select 1 from public.commodities c join t33_row r using (id) where c.name = 'HMS 1&2 Scrap')
             and (select count(*) from public.listings l join t33_before b using (id)
                   where b.commodity = 'HMS 1&2 Scrap' and l.commodity = 'HMS 1&2 Scrap' and l.updated_at = b.updated_at) = 2
             and exists (select 1 from public.saved_searches where commodity = 'HMS 1&2 Scrap')
             and (select count(*) from public.matches) = (select matches from t33_counts)
             and (select count(*) from public.notifications where type = 'match_found') = (select notes from t33_counts)
             and (select count(*) from pg_trigger t where t.tgrelid = 'public.listings'::regclass
                   and t.tgname in ('trg_protect_listing_columns', 'on_listing_matchable') and t.tgenabled = 'O') = 2
            then 'PASS' else 'FAIL' end
  as "T12 the revert restores the old name on list, listings and saved searches, with the same care";

-- A list row that already has the new name must not break the migration.
insert into public.commodities (name, sort_order) values ('HMS 1&2 (80:20)', 12345);
\i sql/062_rename_hms_commodity.sql

select case when (select count(*) from public.commodities where name in ('HMS 1&2 Scrap', 'HMS 1&2 (80:20)')) = 2
             and (select count(*) from public.listings l join t33_before b using (id)
                   where b.commodity = 'HMS 1&2 Scrap' and l.commodity = 'HMS 1&2 (80:20)') = 2
            then 'PASS' else 'FAIL' end
  as "T13 with the new name already in the list the migration does not fail, leaves the old row, still moves listings";

-- Put everything back as the suite expects: the old duplicate row gone, fixtures removed.
delete from public.commodities where name = 'HMS 1&2 Scrap';
delete from public.saved_searches where user_id = (select id from public.profiles where email = 'hms-owner@example.invalid');
delete from public.listings where user_id = (select id from public.profiles where email = 'hms-owner@example.invalid');
update public.commodities set sort_order = (select sort_order from t33_row) where name = 'HMS 1&2 (80:20)';

select case when (select count(*) from public.commodities where name = 'HMS 1&2 (80:20)') = 1
             and not exists (select 1 from public.commodities where name = 'HMS 1&2 Scrap')
            then 'PASS' else 'FAIL' end
  as "T14 the suite is left with one commodity, named HMS 1&2 (80:20)";
