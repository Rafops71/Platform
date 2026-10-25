-- 19_signing_and_acceptance.sql
--
-- Proves sql/031: a signature is complete or refused, it is recorded only
-- through accept_terms() or registration, its frozen copy does not move when
-- the profile does, and it survives the member's deletion.

\set QUIET on
\pset pager off

\echo
\echo '=========== SIGNING THE TERMS ==========='

insert into public.terms_versions (version, language, text, sha256)
values ('9.0', 'en', 'Terms 9.0 (test text)', 'test-sha-9.0-en')
on conflict do nothing;

-- Registered with no signature: an unsigned row, and the gate says no.
select public.test_invite('sign-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('b9b9b9b9-0001-0001-0001-000000000001'::uuid, 'sign-a@example.invalid',
  jsonb_build_object('first_name','Ada','last_name','Signer','phone','+3200000091',
                     'country','Belgium','language','en',
                     'terms_version','9.0','terms_language','en'));

select case when a.signed_name is null then 'PASS' else 'FAIL got ' || a.signed_name end
  as "T1 registration without a signature leaves the row unsigned"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-a@example.invalid';

-- Registered with a full signature: recorded signed, with the version's hash.
select public.test_invite('sign-b@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('b9b9b9b9-0002-0002-0002-000000000002'::uuid, 'sign-b@example.invalid',
  jsonb_build_object('first_name','Bo','last_name','Full','phone','+3200000092',
                     'country','Spain','language','en',
                     'terms_version','9.0','terms_language','en',
                     'signed_name','Bo Full','signing_capacity','individual',
                     'address_line1','3 Calle Mayor','city','Madrid'));

select case when a.signed_name = 'Bo Full' and a.terms_sha256 = 'test-sha-9.0-en'
            then 'PASS' else 'FAIL got ' || coalesce(a.signed_name,'null') end
  as "T2 a complete signature at registration is recorded signed"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-b@example.invalid';

-- A PO box at registration does not count as a signature.
select public.test_invite('sign-c@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('b9b9b9b9-0003-0003-0003-000000000003'::uuid, 'sign-c@example.invalid',
  jsonb_build_object('first_name','Cy','last_name','Box','phone','+3200000093',
                     'country','UAE','language','en',
                     'terms_version','9.0','terms_language','en',
                     'signed_name','Cy Box','signing_capacity','individual',
                     'address_line1','P.O. Box 1234','city','Dubai'));

select case when a.signed_name is null then 'PASS' else 'FAIL signed' end
  as "T3 Item64 a PO box at registration is not accepted as a signature"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-c@example.invalid';

\echo
\echo '=========== THE GATE ==========='

set role authenticated; set test.uid='b9b9b9b9-0001-0001-0001-000000000001';
select case when not public.has_accepted_current_terms() then 'PASS' else 'FAIL' end
  as "T4 Item62 an unsigned member is held at the gate";
reset role; reset test.uid;

-- Each refusal below is expected to raise; the count after them decides.
set role authenticated; set test.uid='b9b9b9b9-0001-0001-0001-000000000001';
select public.accept_terms('9.0','en','Ada','individual',null,'1 Road',null,'Ghent',null,'Belgium');
select public.accept_terms('9.0','en','Ada Signer','company',null,'1 Road',null,'Ghent',null,'Belgium');
select public.accept_terms('9.0','en','Ada Signer','individual',null,'',null,'Ghent',null,'Belgium');
select public.accept_terms('9.0','en','Ada Signer','individual',null,'PO Box 9',null,'Ghent',null,'Belgium');
select public.accept_terms('9.0','en','Ada Signer','individual',null,'1 Road','Apartado 12','Ghent',null,'Spain');
select public.accept_terms('8.9','en','Ada Signer','individual',null,'1 Road',null,'Ghent',null,'Belgium');
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 Item64 one-word name, missing company, no street, PO box, unknown version all refused"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-a@example.invalid' and a.signed_name is not null;

set role authenticated; set test.uid='b9b9b9b9-0001-0001-0001-000000000001';
select public.accept_terms('9.0','en','Ada Signer','company','Signer Trading Ltd',
                           '1 Kouter',null,'Ghent','9000','Belgium');
select case when public.has_accepted_current_terms() then 'PASS' else 'FAIL' end
  as "T6 after signing, the gate lets the member through";
reset role; reset test.uid;

select case when count(*) = 1 and min(a.signed_details->>'company') = 'Signer Trading Ltd'
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 the unsigned row is completed, not duplicated, with the company"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-a@example.invalid';

-- The frozen copy does not follow later profile changes.
update public.profiles set city = 'Antwerp', address_line1 = '9 Meir'
 where email = 'sign-a@example.invalid';

select case when a.signed_details->>'city' = 'Ghent' then 'PASS'
            else 'FAIL got ' || coalesce(a.signed_details->>'city','null') end
  as "T8 the signed copy stays as it was at signing"
from public.terms_acceptances a join public.profiles p on p.id = a.profile_id
where p.email = 'sign-a@example.invalid';

\echo
\echo '=========== ONLY ONE DOOR ==========='

set role authenticated; set test.uid='b9b9b9b9-0001-0001-0001-000000000001';
insert into public.terms_acceptances (profile_id, version, language, signed_name)
select id, 'forged', 'en', 'Ada Signer' from public.profiles where email = 'sign-a@example.invalid';
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T9 Item65 a member cannot write an acceptance row directly"
from public.terms_acceptances where version = 'forged';

select case when not has_function_privilege('anon',
  'public.accept_terms(text,text,text,text,text,text,text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.has_accepted_current_terms()', 'execute')
  then 'PASS' else 'FAIL' end
  as "T10 a visitor who is not signed in cannot call either function";

\echo
\echo '=========== THE RECORD OUTLIVES THE MEMBER ==========='

delete from public.profiles where email = 'sign-b@example.invalid';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T11 Item63 deleting a member keeps their signed acceptance"
from public.terms_acceptances
where profile_id is null and signed_name = 'Bo Full'
  and signed_details->>'email' = 'sign-b@example.invalid';

-- Cleanup: the test version must not stay "current" for later suites.
delete from public.terms_acceptances where version = '9.0';
delete from public.terms_versions where version = '9.0' and sha256 = 'test-sha-9.0-en';

\echo
\echo '=========== THE PUBLISHED TEXT ==========='

-- sql/032 is generated from the page's own text. The recorded hash must be
-- the hash of the text stored beside it, or a signature proves nothing.
select case when count(*) = 2
             and bool_and(sha256 = encode(sha256(convert_to(text, 'UTF8')), 'hex'))
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 Terms 3.0 is published in both languages, hash matching its text"
from public.terms_versions where version = '3.0';
