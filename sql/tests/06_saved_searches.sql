-- 06_saved_searches.sql
--
-- A saved search is a statement about what a participant is looking for, which
-- is commercially their own business. So the interesting assertions here are
-- all about who cannot see it: not another participant, and not an Operator
-- either — deliberately, since Operators have no use for it and a watchlist
-- would tell them what someone is in the market for without that someone ever
-- having said so.
--
-- The rest is the uniqueness rule, which exists so that saving the same search
-- twice is refused rather than quietly producing two identical rows.

\set QUIET on
\pset pager off

\echo
\echo '=========== SAVED SEARCHES ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid,
  'watcher@example.invalid',
  jsonb_build_object('first_name', 'Wanda', 'last_name', 'Watcher',
                     'phone', '+3200000021', 'country', 'Belgium', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'::uuid,
  'nosy@example.invalid',
  jsonb_build_object('first_name', 'Nate', 'last_name', 'Nosy',
                     'phone', '+3200000022', 'country', 'Spain', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'::uuid,
  'watch-op@example.invalid',
  jsonb_build_object('first_name', 'Olive', 'last_name', 'Operator',
                     'phone', '+3200000023', 'country', 'Belgium', 'language', 'en')
);

update public.profiles set status = 'approved'
where email in ('watcher@example.invalid', 'nosy@example.invalid', 'watch-op@example.invalid');
update public.profiles set role = 'operator' where email = 'watch-op@example.invalid';

set role authenticated; set test.uid='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
insert into public.saved_searches (user_id, commodity, listing_type)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'Copper', 'sell');
-- A watchlist entry: one commodity and nothing else.
insert into public.saved_searches (user_id, commodity)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'Cobalt');
reset role; reset test.uid;

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 a participant can save a search and a watched commodity"
from public.saved_searches s
join public.profiles p on p.id = s.user_id
where p.email = 'watcher@example.invalid';

\echo
\echo '=========== NOBODY ELSE CAN SEE IT ==========='

set role authenticated; set test.uid='c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
select case when count(*) = 0 then 'PASS' else 'FAIL read ' || count(*) || ' rows' end
  as "T2 another participant cannot read a saved search"
from public.saved_searches;
reset role; reset test.uid;

-- Operators can read almost everything on this platform, and this is the
-- exception on purpose: what someone is looking for is not the platform's to
-- show around.
set role authenticated; set test.uid='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
select case when count(*) = 0 then 'PASS' else 'FAIL read ' || count(*) || ' rows' end
  as "T3 an Operator cannot read a participant's saved searches either"
from public.saved_searches;
reset role; reset test.uid;

set role authenticated; set test.uid='c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
delete from public.saved_searches
where user_id = (select id from public.profiles where email = 'watcher@example.invalid');
reset role; reset test.uid;

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 another participant cannot delete someone else's saved search"
from public.saved_searches s
join public.profiles p on p.id = s.user_id
where p.email = 'watcher@example.invalid';

-- Saving a search into someone else's account would be a way to make the
-- platform tell you what they are looking at.
set role authenticated; set test.uid='c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
savepoint before_forged_insert;
insert into public.saved_searches (user_id, commodity)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'Forged');
rollback to savepoint before_forged_insert;
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T5 a participant cannot save a search onto another account"
from public.saved_searches where commodity = 'Forged';

\echo
\echo '=========== ONE ROW PER SEARCH ==========='

set role authenticated; set test.uid='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
savepoint before_duplicate;
insert into public.saved_searches (user_id, commodity, listing_type)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'Copper', 'sell');
rollback to savepoint before_duplicate;
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 the same search cannot be saved twice"
from public.saved_searches s
join public.profiles p on p.id = s.user_id
where p.email = 'watcher@example.invalid' and s.commodity = 'Copper';

-- "Any commodity" saved twice is the case NULLs would let through, since NULL
-- never equals NULL and a plain unique constraint would not catch it.
set role authenticated; set test.uid='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
insert into public.saved_searches (user_id, listing_type)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'buy');
savepoint before_null_duplicate;
insert into public.saved_searches (user_id, listing_type)
values ((select id from public.profiles where email = 'watcher@example.invalid'), 'buy');
rollback to savepoint before_null_duplicate;
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 a search whose criteria are mostly empty is still unique"
from public.saved_searches s
join public.profiles p on p.id = s.user_id
where p.email = 'watcher@example.invalid' and s.commodity is null and s.listing_type = 'buy';

-- The same search saved by two different people is two different searches.
set role authenticated; set test.uid='c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
insert into public.saved_searches (user_id, commodity, listing_type)
values ((select id from public.profiles where email = 'nosy@example.invalid'), 'Copper', 'sell');
reset role; reset test.uid;

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 two participants may each save the same search"
from public.saved_searches where commodity = 'Copper' and listing_type = 'sell';

\echo
\echo '=========== A SAVED SEARCH IS NOT EDITABLE ==========='

-- There is no update policy and no update grant: changing a saved search means
-- removing it and saving the one you want, which keeps the uniqueness index
-- from being walked around.
set role authenticated; set test.uid='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
update public.saved_searches set commodity = 'Gold'
where user_id = (select id from public.profiles where email = 'watcher@example.invalid');
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T9 a saved search cannot be edited in place"
from public.saved_searches where commodity = 'Gold';

set role authenticated; set test.uid='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
delete from public.saved_searches
where user_id = (select id from public.profiles where email = 'watcher@example.invalid')
  and commodity = 'Cobalt';
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T10 a participant can remove their own saved search"
from public.saved_searches s
join public.profiles p on p.id = s.user_id
where p.email = 'watcher@example.invalid' and s.commodity = 'Cobalt';
