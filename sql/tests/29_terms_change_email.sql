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

-- ---- Item 88: a deliberate, per-version exclusion (owner's decision, 2026-11-08) ----
-- Three live accounts are the owner's own test accounts but carry no marker.
-- Their profile ids are put into terms_change_emails for one version before it
-- is published; the trigger then skips them, with an empty summary, and the
-- blank-summary guard still holds for everybody else and for every other version.
-- Here the four approved real participants (3 English, 1 Spanish) stand for them.
create temp table t29_before as select count(*) as n from public.email_outbox;

insert into public.terms_change_emails (version, profile_id)
select '9.5', id from public.profiles
 where role = 'participant' and status = 'approved'
   and email not like 'jericho-e2e-%' and email not like '%@example.%';

select case when count(*) = 4 then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 Item88 four approved real members are set aside for version 9.5 (setup check)"
from public.terms_change_emails where version = '9.5';

do $$ begin
  insert into public.terms_versions (version, language, text, sha256) values ('9.5', 'es', 'x', 'x');
  insert into public.terms_versions (version, language, text, sha256) values ('9.5', 'en', 'x', 'x');
  insert into t29_hold values ('publish 9.5', 'OK');
exception when others then insert into t29_hold values ('publish 9.5', sqlerrm); end $$;

select case when msg = 'OK' then 'PASS' else 'FAIL ' || msg end
  as "T13 Item88 a set-aside version publishes in both languages with an empty summary"
from t29_hold where label = 'publish 9.5';

select case when (select count(*) from public.email_outbox) = (select n from t29_before)
             and (select count(*) from public.terms_change_emails where version = '9.5') = 4
            then 'PASS' else 'FAIL' end
  as "T14 Item88 the set-aside members are emailed nothing and no other row was added for 9.5";

-- The set-aside is for 9.5 only: the same members under 9.3 are still refused.
do $$ begin
  insert into public.terms_versions (version, language, text, sha256) values ('9.3', 'en', 'x', 'x');
  insert into t29_hold values ('publish 9.3', 'OK');
exception when others then insert into t29_hold values ('publish 9.3', sqlerrm); end $$;

select case when msg like '%no change summary%' then 'PASS' else 'FAIL ' || msg end
  as "T15 Item88 the set-aside does not carry to another version: 9.3 is still refused"
from t29_hold where label = 'publish 9.3';

-- A fifth, later approved real member is not covered: the guard fires again.
select public.test_invite('chg-late@mailcheck-platform.com');
insert into auth.users (id, email, raw_user_meta_data) values
('f2f2f2f2-0008-0008-0008-000000000008'::uuid, 'chg-late@mailcheck-platform.com',
 jsonb_build_object('first_name','Lea','last_name','Late','phone','+3200000608','country','Chile','language','en'));
update public.profiles set status = 'approved' where email = 'chg-late@mailcheck-platform.com';

insert into public.terms_change_emails (version, profile_id)
select '9.4', id from public.profiles
 where role = 'participant' and status = 'approved'
   and email not like 'jericho-e2e-%' and email not like '%@example.%'
   and email <> 'chg-late@mailcheck-platform.com';

do $$ begin
  insert into public.terms_versions (version, language, text, sha256) values ('9.4', 'en', 'x', 'x');
  insert into t29_hold values ('publish 9.4', 'OK');
exception when others then insert into t29_hold values ('publish 9.4', sqlerrm); end $$;

select case when msg like '%no change summary%' then 'PASS' else 'FAIL ' || msg end
  as "T16 Item88 a real member not set aside brings the blank-summary guard back"
from t29_hold where label = 'publish 9.4';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T17 Item88 the refused 9.4 publish leaves no version row behind"
from public.terms_versions where version = '9.4';

update public.profiles set status = 'approved' where id in (select id from t29_set_aside);
