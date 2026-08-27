-- 04_terms_acceptance.sql
--
-- What the database is responsible for around Terms & Conditions acceptance:
-- that a record is created automatically when a participant registers, that it
-- carries the version and language they actually accepted, that it cannot be
-- edited or deleted afterwards, and that one participant cannot read another's.
--
-- The browser checkbox is not tested here — that is the E2E suite's job
-- (tests/e2e/terms.spec.js). What matters at this layer is that the record
-- exists even if the browser never asks for it, because acceptance the client
-- is trusted to file is acceptance that can simply not be filed.
--
-- Setup inserts into auth.users on a direct connection, which is what fires
-- handle_new_user() — the same path Supabase Auth takes on a real signup.

\set QUIET on
\pset pager off

\echo
\echo '=========== TERMS ACCEPTANCE ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid,
  'terms-en@example.invalid',
  jsonb_build_object(
    'first_name', 'Tess', 'last_name', 'English', 'phone', '+3200000001',
    'country', 'Belgium', 'language', 'en',
    'terms_version', '2.0', 'terms_language', 'en'
  )
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2'::uuid,
  'terms-es@example.invalid',
  jsonb_build_object(
    'first_name', 'Tomas', 'last_name', 'Espanol', 'phone', '+3200000002',
    'country', 'Spain', 'language', 'es',
    'terms_version', '2.0', 'terms_language', 'es'
  )
);

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 registering records an acceptance automatically"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

select case when a.version = '2.0' then 'PASS' else 'FAIL got ' || coalesce(a.version, 'null') end
  as "T2 the accepted version is recorded"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

select case when a.language = 'es' then 'PASS' else 'FAIL got ' || coalesce(a.language, 'null') end
  as "T3 the language the terms were read in is recorded"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-es@example.invalid';

select case when a.accepted_at is not null then 'PASS' else 'FAIL' end
  as "T4 the acceptance is timestamped"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

-- A registration arriving with no version attached must still leave evidence.
-- A missing row would be ambiguous; 'unrecorded' is not.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'::uuid,
  'terms-none@example.invalid',
  jsonb_build_object(
    'first_name', 'Noa', 'last_name', 'Version', 'phone', '+3200000003',
    'country', 'Belgium', 'language', 'en'
  )
);

select case when a.version = 'unrecorded' then 'PASS' else 'FAIL got ' || coalesce(a.version, 'null') end
  as "T5 a registration with no version still leaves a record"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-none@example.invalid';

\echo
\echo '=========== ACCEPTANCE IS IMMUTABLE ==========='

-- There is no update policy and no delete policy on the table, so a
-- participant acting as themselves can change nothing. Both statements below
-- are expected to affect zero rows rather than to raise.

set role authenticated; set test.uid='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
update public.terms_acceptances set version = 'tampered'
where profile_id = (select id from public.profiles where email = 'terms-en@example.invalid');
reset role; reset test.uid;

select case when a.version = '2.0' then 'PASS' else 'FAIL got ' || a.version end
  as "T6 a participant cannot rewrite their own acceptance"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

set role authenticated; set test.uid='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
delete from public.terms_acceptances
where profile_id = (select id from public.profiles where email = 'terms-en@example.invalid');
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 a participant cannot delete their own acceptance"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

\echo
\echo '=========== A LATER VERSION ADDS TO THE HISTORY ==========='

-- The uniqueness constraint is on (profile_id, version), not on profile_id, so
-- accepting a newer version has to add a row rather than replace the old one.
-- This matters now that a second version exists: the record of what someone
-- agreed to in 2.0 must survive them later accepting 3.0, because the question
-- asked afterwards is always "what were they bound by at the time".

set role authenticated; set test.uid='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
insert into public.terms_acceptances (profile_id, version, language)
values (
  (select id from public.profiles where email = 'terms-en@example.invalid'),
  '3.0', 'en'
);
reset role; reset test.uid;

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 accepting a later version adds a row rather than replacing"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T11 the earlier acceptance survives unchanged"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid' and a.version = '2.0';

-- And the same version cannot be recorded twice for the same participant. The
-- insert below is expected to be rejected by the uniqueness constraint; the
-- count that follows is what decides the result.
set role authenticated; set test.uid='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
insert into public.terms_acceptances (profile_id, version, language)
values (
  (select id from public.profiles where email = 'terms-en@example.invalid'),
  '3.0', 'en'
);
reset role; reset test.uid;

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 the same version cannot be recorded twice"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

-- Leave only the registration acceptance behind, so the privacy checks below
-- count what they were written to count.
delete from public.terms_acceptances
where version = '3.0'
  and profile_id = (select id from public.profiles where email = 'terms-en@example.invalid');

\echo
\echo '=========== ACCEPTANCE IS PRIVATE ==========='

-- The record carries no commercial detail, but it is tied to an identity, and
-- this platform is built on participants not being able to enumerate one
-- another.

set role authenticated; set test.uid='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

select case when count(*) = 0 then 'PASS' else 'FAIL saw ' || count(*) end
  as "T13 a participant cannot read another participant's acceptance"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-es@example.invalid';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T14 a participant can read their own acceptance"
from public.terms_acceptances a
join public.profiles p on p.id = a.profile_id
where p.email = 'terms-en@example.invalid';

reset role; reset test.uid;
