-- 38_receipt_test_marker.sql
--
-- Proves sql/067 and its revert: the Terms-receipt trigger keeps BOTH test-account markers
-- ('myplatform-e2e-%' and 'jericho-e2e-%'), so a test account never queues a real receipt, while
-- an ordinary address still does. The revert gives the 048 body back (jericho marker only).
-- Ends with 067 applied.

\set QUIET on
\pset pager off

\echo
\echo '=========== TERMS RECEIPT TEST MARKER ==========='

\i sql/067_receipt_test_marker.sql

select case when pg_get_functiondef('public.trg_terms_receipt_email'::regproc) like '%myplatform-e2e-%'
              and pg_get_functiondef('public.trg_terms_receipt_email'::regproc) like '%jericho-e2e-%'
            then 'PASS' else 'FAIL' end
  as "T1 the receipt trigger names both test-account prefixes";

-- Behaviour. The addresses are NOT @example.* (the function skips those by a separate rule), so only
-- the prefix decides: a myplatform-e2e- address is sent no receipt, an ordinary one is sent exactly one.
select public.test_invite('myplatform-e2e-t38@mailcheck-platform.com');
select public.test_invite('real-t38@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
 ('f8f8f8f8-0038-0038-0038-000000000001'::uuid, 'myplatform-e2e-t38@mailcheck-platform.com',
  jsonb_build_object('first_name','Test','last_name','Marker','phone','+3200003801','country','Chile','language','en')),
 ('f8f8f8f8-0038-0038-0038-000000000002'::uuid, 'real-t38@mailcheck-platform.com',
  jsonb_build_object('first_name','Real','last_name','Person','phone','+3200003802','country','Chile','language','en'));
update public.profiles set status = 'approved' where email like '%-t38@mailcheck-platform.com';
delete from public.email_outbox where to_email like '%-t38@mailcheck-platform.com';

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.5', 'en', 'Test Marker', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'myplatform-e2e-t38@mailcheck-platform.com';
select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end
  as "T2 a myplatform-e2e- account that signs the Terms is sent no receipt"
from public.email_outbox where to_email = 'myplatform-e2e-t38@mailcheck-platform.com';

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.5', 'en', 'Real Person', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'real-t38@mailcheck-platform.com';
select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T3 an ordinary address that signs the Terms is sent exactly one receipt"
from public.email_outbox where to_email = 'real-t38@mailcheck-platform.com';

create temp table t38_def as select pg_get_functiondef('public.trg_terms_receipt_email'::regproc) d;

\i sql/revert/067_receipt_test_marker_revert.sql
select case when pg_get_functiondef('public.trg_terms_receipt_email'::regproc) not like '%myplatform-e2e-%'
              and pg_get_functiondef('public.trg_terms_receipt_email'::regproc) like '%jericho-e2e-%'
            then 'PASS' else 'FAIL' end
  as "T4 after the revert only the older jericho marker is left (the 048 body)";

\i sql/067_receipt_test_marker.sql
select case when pg_get_functiondef('public.trg_terms_receipt_email'::regproc) = (select d from t38_def)
            then 'PASS' else 'FAIL' end
  as "T5 after revert and re-apply the function is exactly what 067 first produced";

\i sql/067_receipt_test_marker.sql
select case when pg_get_functiondef('public.trg_terms_receipt_email'::regproc) = (select d from t38_def)
            then 'PASS' else 'FAIL' end
  as "T6 applying 067 a second time changes nothing (idempotent)";

delete from public.email_outbox where to_email like '%-t38@mailcheck-platform.com';
