-- 29_terms_change_email.sql
--
-- Proves sql/056 (the Terms-changed email) and sql/057 (signed once, not held).
-- An approved participant is emailed once per new Terms version, in their own
-- language, with the effective date and the summary. Pending, operator and test
-- accounts are not. A publish with members to email but no summary is refused.
-- A member who signed an older version is not held; a member who never signed is.
-- Approved members left by earlier files are set aside for this file and put
-- back at the end, so every count here is exact.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE TERMS-CHANGED EMAIL ==========='

create temp table t29_hold (label text, msg text);
create temp table t29_set_aside as select id from public.profiles where status = 'approved';
update public.profiles set status = 'pending' where id in (select id from t29_set_aside);

select public.test_invite('chg-en@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0001-0001-0001-000000000001'::uuid, 'chg-en@mailcheck-platform.com',
 jsonb_build_object('first_name','Ana','last_name','Cambio','phone','+3200000601','country','Chile','language','en'));
select public.test_invite('jericho-e2e-chg@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0002-0002-0002-000000000002'::uuid, 'jericho-e2e-chg@example.invalid',
 jsonb_build_object('first_name','Test','last_name','Account','phone','+3200000602','country','Chile','language','en'));
select public.test_invite('chg-pending@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0003-0003-0003-000000000003'::uuid, 'chg-pending@mailcheck-platform.com',
 jsonb_build_object('first_name','Pen','last_name','Ding','phone','+3200000603','country','Chile','language','en'));
select public.test_invite('chg-op@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0004-0004-0004-000000000004'::uuid, 'chg-op@mailcheck-platform.com',
 jsonb_build_object('first_name','Op','last_name','Erator','phone','+3200000604','country','Chile','language','en'));
select public.test_invite('chg-signed@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0005-0005-0005-000000000005'::uuid, 'chg-signed@mailcheck-platform.com',
 jsonb_build_object('first_name','Sam','last_name','Signed','phone','+3200000605','country','Chile','language','en'));
select public.test_invite('chg-unsigned@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0006-0006-0006-000000000006'::uuid, 'chg-unsigned@mailcheck-platform.com',
 jsonb_build_object('first_name','Uma','last_name','Nsigned','phone','+3200000606','country','Chile','language','en'));

update public.profiles set status = 'approved'
 where email in ('chg-en@mailcheck-platform.com', 'jericho-e2e-chg@example.invalid',
                 'chg-op@mailcheck-platform.com', 'chg-signed@mailcheck-platform.com',
                 'chg-unsigned@mailcheck-platform.com');
update public.profiles set role = 'operator' where email = 'chg-op@mailcheck-platform.com';

insert into public.terms_acceptances (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
select id, '3.6', 'en', 'Sam Signed', 'individual', '{}'::jsonb, 'x'
  from public.profiles where email = 'chg-signed@mailcheck-platform.com';

-- Publishing 9.8 in Spanish with no summary is fine: no approved member reads Spanish yet.
do $$ begin
  insert into public.terms_versions (version, language, text, sha256) values ('9.8', 'es', 'x', 'x');
  insert into t29_hold values ('publish 9.8 es', 'OK');
exception when others then insert into t29_hold values ('publish 9.8 es', sqlerrm); end $$;

select case when msg = 'OK' then 'PASS' else 'FAIL ' || msg end
  as "T1 Item88 a version with no summary publishes when no approved member reads that language"
from t29_hold where label = 'publish 9.8 es';

-- Publishing 9.9 in English with no summary, to members who would be emailed, is refused.
do $$ begin
  insert into public.terms_versions (version, language, text, sha256) values ('9.9', 'en', 'x', 'x');
  insert into t29_hold values ('publish 9.9 en', 'OK');
exception when others then insert into t29_hold values ('publish 9.9 en', sqlerrm); end $$;

select case when msg like '%no change summary%' then 'PASS' else 'FAIL ' || msg end
  as "T2 Item88 a version is refused when members would be emailed a blank summary"
from t29_hold where label = 'publish 9.9 en';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 Item88 the refused publish leaves no version row and no email behind"
from public.terms_versions where version = '9.9'
union all
select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
from public.terms_change_emails where version = '9.9';

insert into public.terms_versions (version, language, text, sha256, change_summary)
values ('9.9', 'en', 'x', 'x', 'First change line');

select case when count(*) = 3 and bool_and(body_text like '%First change line%')
                and bool_and(body_text like '%https://app.myplatform.trade/terms.html%')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 Item88 each approved English member is emailed once, with the summary and the link"
from public.email_outbox
where to_email in ('chg-en@mailcheck-platform.com', 'chg-signed@mailcheck-platform.com', 'chg-unsigned@mailcheck-platform.com')
  and subject like 'MyPlatform Terms: changes from %';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 Item88 pending, operator and test accounts are not emailed about the change"
from public.email_outbox
where to_email in ('chg-pending@mailcheck-platform.com', 'chg-op@mailcheck-platform.com',
                   'jericho-e2e-chg@example.invalid')
  and subject like 'MyPlatform Terms: changes from %';

select case when (select effective_at - published_at from public.terms_versions where version = '9.9' and language = 'en') = interval '7 days'
            then 'PASS' else 'FAIL' end
  as "T6 Item88 the new Terms take effect seven days after they are published";

select case when subject ~ '^MyPlatform Terms: changes from [0-9]{1,2} [A-Z][a-z]+ [0-9]{4}$'
              and subject = 'MyPlatform Terms: changes from '
                  || public.terms_effective_text((select effective_at from public.terms_versions where version = '9.9' and language = 'en'), 'en')
            then 'PASS' else 'FAIL got ' || subject end
  as "T7 Item88 the English date reads like 15 November 2026 and is the effective date"
from public.email_outbox where to_email = 'chg-en@mailcheck-platform.com' and subject like 'MyPlatform Terms: changes from %';

-- A Spanish member, added now, is emailed in Spanish only when the Spanish text is published.
select public.test_invite('chg-es@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0007-0007-0007-000000000007'::uuid, 'chg-es@mailcheck-platform.com',
 jsonb_build_object('first_name','Bea','last_name','Espanola','phone','+3200000607','country','Chile','language','es'));
update public.profiles set status = 'approved' where email = 'chg-es@mailcheck-platform.com';

insert into public.terms_versions (version, language, text, sha256, change_summary)
values ('9.9', 'es', 'x', 'x', 'Primer cambio');

select case when count(*) = 1
             and min(subject) = 'Términos de MyPlatform: cambios desde el '
                 || public.terms_effective_text((select effective_at from public.terms_versions where version = '9.9' and language = 'es'), 'es')
             and bool_and(body_text like '%Primer cambio%')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 Item88 the Spanish member is emailed once, in Spanish, with the Spanish date and summary"
from public.email_outbox where to_email = 'chg-es@mailcheck-platform.com' and subject like 'Términos de MyPlatform: cambios desde el %';

select case when count(*) = 4 then 'PASS' else 'FAIL got ' || count(*) end
  as "T9 Item88 each member is recorded once for the version, and no English member is emailed again"
from public.terms_change_emails where version = '9.9';

set role authenticated; set test.uid = 'f2f2f2f2-0005-0005-0005-000000000005';
select case when public.has_accepted_current_terms() then 'PASS' else 'FAIL' end
  as "T10 Item62 a member who signed an older Terms version is not held by a newer one";
reset role; reset test.uid;

set role authenticated; set test.uid = 'f2f2f2f2-0006-0006-0006-000000000006';
select case when not public.has_accepted_current_terms() then 'PASS' else 'FAIL' end
  as "T11 Item62 a member who has never signed is still held";
reset role; reset test.uid;

update public.profiles set status = 'approved' where id in (select id from t29_set_aside);
