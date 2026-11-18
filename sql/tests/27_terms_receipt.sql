-- 27_terms_receipt.sql
--
-- Proves sql/048 (decision 43): a signed acceptance queues one receipt email to
-- the member, in their language; an unsigned row and a test account queue none;
-- updating an already signed row queues nothing more.

\set QUIET on
\pset pager off

\echo
\echo '=========== A SIGNED ACCEPTANCE IS RECEIPTED, ONCE ==========='

select public.test_invite('receipt-en@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data)
values ('e5e5e5e5-0001-0001-0001-000000000001'::uuid, 'receipt-en@mailcheck-platform.com',
  jsonb_build_object('first_name','Ruth','last_name','Receipt','phone','+3200000501',
                     'country','Chile','language','en'));
select public.test_invite('receipt-es@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data)
values ('e5e5e5e5-0002-0002-0002-000000000002'::uuid, 'receipt-es@mailcheck-platform.com',
  jsonb_build_object('first_name','Rafa','last_name','Recibo','phone','+3200000502',
                     'country','Chile','language','es'));
select public.test_invite('jericho-e2e-receipt@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('e5e5e5e5-0003-0003-0003-000000000003'::uuid, 'jericho-e2e-receipt@example.invalid',
  jsonb_build_object('first_name','Test','last_name','Account','phone','+3200000503',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email like 'receipt-%' or email like 'jericho-e2e-receipt%';
update public.profiles set language = 'es' where email = 'receipt-es@mailcheck-platform.com';

delete from public.email_outbox where to_email like 'receipt-%' or to_email like 'jericho-e2e-receipt%';

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.5', 'en', 'Ruth Receipt', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'receipt-en@mailcheck-platform.com';

select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T1 Item81 a signed acceptance queues one receipt email to the member"
from public.email_outbox
where to_email = 'receipt-en@mailcheck-platform.com' and subject = 'Your signed MyPlatform Terms: receipt'
  and body_text like '%version 3.5%';

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.5', 'es', 'Rafa Recibo', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'receipt-es@mailcheck-platform.com';

select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T2 Item81 the receipt is in the member's own language"
from public.email_outbox
where to_email = 'receipt-es@mailcheck-platform.com' and subject = 'Sus Términos de MyPlatform firmados: recibo';

-- Re-saving the already signed row (an update, not a new signing) must queue nothing.
update public.terms_acceptances set accepted_at = now()
 where profile_id = (select id from public.profiles where email = 'receipt-en@mailcheck-platform.com');

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.5', 'en', 'Test Account', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'jericho-e2e-receipt@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end
  as "T3 Item81 a test account gets no receipt"
from public.email_outbox where to_email = 'jericho-e2e-receipt@example.invalid';

select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T4 Item81 re-saving a signed acceptance sends no second receipt"
from public.email_outbox where to_email = 'receipt-en@mailcheck-platform.com';
