-- 25_welcome_seen.sql
--
-- Proves sql/044: the welcome page is shown once. A new member starts with no
-- record of having seen it; they can record it on their own profile row and
-- nobody else's.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE WELCOME PAGE IS SHOWN ONCE ==========='

select public.test_invite('welcome-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('c3c3c3c3-0001-0001-0001-000000000001'::uuid, 'welcome-a@example.invalid',
  jsonb_build_object('first_name','Wanda','last_name','Welcome','phone','+3200000301',
                     'country','Chile','language','en'));
select public.test_invite('welcome-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('c3c3c3c3-0002-0002-0002-000000000002'::uuid, 'welcome-b@example.invalid',
  jsonb_build_object('first_name','Walter','last_name','Welcome','phone','+3200000302',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email like 'welcome-%@example.invalid';

select case when count(*) = 2 then 'PASS' else 'FAIL' end
  as "T1 Item77 a new member has not yet seen the welcome page"
from public.profiles where email like 'welcome-%@example.invalid' and welcome_seen_at is null;

set role authenticated; set test.uid='c3c3c3c3-0001-0001-0001-000000000001';
update public.profiles set welcome_seen_at = now()
 where user_id = 'c3c3c3c3-0001-0001-0001-000000000001'::uuid;
reset role; reset test.uid;

select case when welcome_seen_at is not null then 'PASS' else 'FAIL' end
  as "T2 a member can record that they have seen their own welcome page"
from public.profiles where email = 'welcome-a@example.invalid';

set role authenticated; set test.uid='c3c3c3c3-0001-0001-0001-000000000001';
update public.profiles set welcome_seen_at = now()
 where user_id = 'c3c3c3c3-0002-0002-0002-000000000002'::uuid;
reset role; reset test.uid;

select case when welcome_seen_at is null then 'PASS' else 'FAIL' end
  as "T3 a member cannot record it for somebody else"
from public.profiles where email = 'welcome-b@example.invalid';

