-- Jericho Platform — language-aware notification emails (sql/008).
--
-- Runs against the throwaway embedded PostgreSQL built by
-- scripts/run-sql-tests.js, so it is entirely test-safe: nothing here touches
-- the live database and nothing sends mail. Every assertion reads the row
-- that the trigger queued into email_outbox — which is exactly what
-- scripts/send-listing-emails.js would later put in the envelope.
--
-- The four accounts:
--   sofia   participant, language 'es'  — must get Spanish
--   edward  participant, language 'en'  — must get English
--   noprefs participant, no language in signup metadata — must default to English
--   omar    OPERATOR whose profile says 'es' — must get English anyway
--
-- Addresses are distinctive so each assertion can scope itself to one
-- recipient instead of counting outbox rows globally.

\pset pager off
\set QUIET on

insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','sofia@example.com',
    '{"first_name":"Sofia","last_name":"Ruiz","country":"Spain","phone":"+34","language":"es"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','edward@example.com',
    '{"first_name":"Edward","last_name":"Hale","country":"United Kingdom","phone":"+44","language":"en"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','noprefs@example.com',
    '{"first_name":"Nadia","last_name":"Prefs","country":"Belgium","phone":"+32"}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','omar@example.com',
    '{"first_name":"Omar","last_name":"Diaz","country":"Spain","phone":"+34","language":"es"}');

-- Omar is an operator who genuinely prefers Spanish in the UI.
update public.profiles set role='operator', status='approved' where email='omar@example.com';

\set QUIET off

\echo ''
\echo '=========== LANGUAGE PREFERENCE IS STORED ==========='

select case when language='es' then 'PASS' else 'FAIL (got '||language||')' end
  as "E1 signup metadata language is stored on the profile"
from public.profiles where email='sofia@example.com';

select case when language='en' then 'PASS' else 'FAIL (got '||language||')' end
  as "E2 no language in signup metadata defaults to English"
from public.profiles where email='noprefs@example.com';

select case when public.norm_lang('fr')='en' and public.norm_lang(null)='en'
                 and public.norm_lang('es')='es'
            then 'PASS' else 'FAIL' end
  as "E3 norm_lang folds anything unrecognised to English";

-- A participant may change their own language; it is not a protected column.
set role authenticated; set test.uid='aaaaaaaa-0000-0000-0000-000000000002';
update public.profiles set language='es' where user_id='aaaaaaaa-0000-0000-0000-000000000002';
reset role; reset test.uid;
select case when language='es' then 'PASS' else 'FAIL (got '||language||')' end
  as "E4 participant can change their own language"
from public.profiles where email='edward@example.com';
-- Put Edward back to English for the rest of the suite.
update public.profiles set language='en' where email='edward@example.com';

\echo ''
\echo '=========== REGISTRATION SUBMITTED ==========='

select case when subject='Hemos recibido su registro en la Plataforma Jericho'
                 and position('Hola Sofia:' in body_text) > 0
                 and position('pendiente de revisión' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E5 Spanish participant gets the Spanish registration email"
from public.email_outbox where to_email='sofia@example.com';

select case when subject='Your Jericho Platform registration has been submitted'
                 and position('Hello Edward,' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E6 English participant gets the English registration email"
from public.email_outbox where to_email='edward@example.com';

select case when subject='Your Jericho Platform registration has been submitted'
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E7 participant with no preference gets English"
from public.email_outbox where to_email='noprefs@example.com';

-- No Spanish must leak into an English email, and vice versa.
select case when position('Hola' in body_text)=0 and position('registro' in body_text)=0
            then 'PASS' else 'FAIL' end
  as "E8 the English email contains no Spanish"
from public.email_outbox where to_email='edward@example.com';

\echo ''
\echo '=========== APPROVAL AND REJECTION ==========='

\set QUIET on
update public.profiles set status='approved' where email='sofia@example.com';
update public.profiles set status='approved' where email='edward@example.com';
update public.profiles set status='rejected' where email='noprefs@example.com';
\set QUIET off

select case when subject='Su registro en la Plataforma Jericho ha sido aprobado'
                 and position('Buenas noticias' in body_text) > 0
                 and position('publicaciones' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E9 approval email is Spanish for a Spanish participant"
from public.email_outbox
where to_email='sofia@example.com' and subject like '%aprobado%';

select case when subject='Your Jericho Platform registration has been approved'
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E10 approval email is English for an English participant"
from public.email_outbox
where to_email='edward@example.com' and subject like '%approved%';

select case when subject='Your Jericho Platform registration was not approved'
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E11 rejection email follows the same preference (English default)"
from public.email_outbox
where to_email='noprefs@example.com' and subject like '%not approved%';

-- Rejection in Spanish, via a fresh account so the decision trigger fires once.
\set QUIET on
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000005','rechazado@example.com',
    '{"first_name":"Rita","last_name":"Vela","country":"Spain","phone":"+34","language":"es"}');
update public.profiles set status='rejected' where email='rechazado@example.com';
\set QUIET off

select case when subject='Su registro en la Plataforma Jericho no ha sido aprobado'
                 and position('no ha sido aprobado' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E12 rejection email is Spanish for a Spanish participant"
from public.email_outbox
where to_email='rechazado@example.com' and subject like '%no ha sido%';

\echo ''
\echo '=========== INVITATION ==========='

\set QUIET on
set role authenticated; set test.uid='aaaaaaaa-0000-0000-0000-000000000004';
select public.queue_invitation_email('invitado@example.com', 'https://x/register.html?token=t1', 'es');
select public.queue_invitation_email('invitee@example.com', 'https://x/register.html?token=t2', 'en');
-- Two-argument call: the pre-008 signature must still work and still be English.
select public.queue_invitation_email('legacy@example.com', 'https://x/register.html?token=t3');
reset role; reset test.uid;
\set QUIET off

select case when subject='Le han invitado a la Plataforma Jericho'
                 and position('Utilice este enlace' in body_text) > 0
                 and position('token=t1' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E13 invitation email is Spanish when the operator picks Spanish"
from public.email_outbox where to_email='invitado@example.com';

select case when subject='You have been invited to the Jericho Platform'
                 and position('token=t2' in body_text) > 0
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E14 invitation email is English when English is picked"
from public.email_outbox where to_email='invitee@example.com';

select case when subject='You have been invited to the Jericho Platform'
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E15 the old 2-argument invitation call still works and is English"
from public.email_outbox where to_email='legacy@example.com';

\echo ''
\echo '=========== NEW LISTING ==========='

-- Sofia posts. Edward (en), Nadia (en by default, but rejected so excluded)
-- and Omar (operator, profile says es) are the candidate recipients.
\set QUIET on
set role authenticated; set test.uid='aaaaaaaa-0000-0000-0000-000000000001';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, specification, notes, price_conditions, currency, status, reference_number)
 select id,'sell','Antimony',1200,'Metric tons','FOB','Bolivia','Sb 99.65%','Sin observaciones',14000,'USD','available', public.next_reference('sell')
 from public.profiles where user_id='aaaaaaaa-0000-0000-0000-000000000001';
reset role; reset test.uid;
\set QUIET off

select case when count(*)=0 then 'PASS' else 'FAIL (poster got '||count(*)||')' end
  as "E16 the poster is not emailed about their own listing"
from public.email_outbox
where to_email='sofia@example.com' and subject like '%Antimony%';

select case when subject like 'New Sell Offer — Antimony (%'
                 and position('Commodity: Antimony' in body_text) > 0
                 and position('Origin: Bolivia' in body_text) > 0
                 and position('Metric tons' in body_text) > 0
            then 'PASS' else 'FAIL ('||coalesce(subject,'no row')||')' end
  as "E17 English participant gets the English listing email"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Antimony%';

-- The operator prefers Spanish in the UI and must still get English mail.
select case when subject like 'New Sell Offer — Antimony (%'
                 and position('Commodity: Antimony' in body_text) > 0
                 and position('Materia prima' in body_text) = 0
            then 'PASS' else 'FAIL ('||coalesce(subject,'no row')||')' end
  as "E18 an operator gets English even with language=es on their profile"
from public.email_outbox
where to_email='omar@example.com' and subject like '%Antimony%';

-- Now a Spanish recipient: Edward switches to Spanish and Sofia posts again.
\set QUIET on
update public.profiles set language='es' where email='edward@example.com';
set role authenticated; set test.uid='aaaaaaaa-0000-0000-0000-000000000001';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination, specification, status, reference_number)
 select id,'buy','Cobalt',75,'Dry Metric Ton Units (DMTU)','CIF','Spain','Co 20% min','available', public.next_reference('buy')
 from public.profiles where user_id='aaaaaaaa-0000-0000-0000-000000000001';
reset role; reset test.uid;
\set QUIET off

select case when subject like 'Nueva Solicitud de compra — Cobalt (%'
                 and position('Se ha publicado una nueva Solicitud de compra' in body_text) > 0
                 and position('Materia prima: Cobalt' in body_text) > 0
                 and position('Especificación / grado' in body_text) > 0
                 and position('Observaciones' in body_text) > 0
                 and position('buzón' in body_text) > 0
            then 'PASS' else 'FAIL ('||coalesce(subject,'no row')||')' end
  as "E19 Spanish participant gets the Spanish listing email"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Cobalt%';

select case when position('Destino: Spain' in body_text) > 0
                 and position('Destination' in body_text) = 0
            then 'PASS' else 'FAIL' end
  as "E20 a buy request says Destino, not Destination, in Spanish"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Cobalt%';

select case when position('Unidades de tonelada métrica seca (DMTU)' in body_text) > 0
            then 'PASS' else 'FAIL' end
  as "E21 units are translated inline in the Spanish quantity line"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Cobalt%';

select case when position('Ninguno indicado' in body_text) > 0
            then 'PASS' else 'FAIL' end
  as "E22 the no-documents fallback is translated too"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Cobalt%';

-- The whole point: no English labels left inside the Spanish email.
select case when position('Commodity:' in body_text)=0
                 and position('Quantity:' in body_text)=0
                 and position('Notes:' in body_text)=0
                 and position('Documents available:' in body_text)=0
                 and position('anonymously' in body_text)=0
            then 'PASS' else 'FAIL' end
  as "E23 no English labels survive in the Spanish listing email"
from public.email_outbox
where to_email='edward@example.com' and subject like '%Cobalt%';

-- And the operator still got English for this one as well.
select case when position('Destination: Spain' in body_text) > 0
                 and position('Destino' in body_text) = 0
            then 'PASS' else 'FAIL' end
  as "E24 the operator's copy of the same listing is still English"
from public.email_outbox
where to_email='omar@example.com' and subject like '%Cobalt%';

\echo ''
\echo '=========== DICTIONARY FALLBACK ==========='

select case when subject='You have been invited to the Jericho Platform'
            then 'PASS' else 'FAIL ('||subject||')' end
  as "E25 an unknown language falls back to the English template"
from public.render_email('invitation', 'de', '{"link":"https://x"}'::jsonb);

select case when position('{{' in body_text)=0 and position('{{' in subject)=0
            then 'PASS' else 'FAIL (unsubstituted placeholder left)' end
  as "E26 every placeholder is substituted"
from public.render_email('new_listing', 'es', jsonb_build_object(
  'kind','Oferta de venta','ref','SELL-26-999','commodity','Copper','quantity','10',
  'unit','Toneladas métricas','spec','x','incoterm','FOB','origin_line','Origen: Chile',
  'price','1 USD','notes','x','docs','x'));

select case when public.email_phrase('unit.Metric tons','es')='Toneladas métricas'
                 and public.email_phrase('unit.Metric tons','de')='Metric tons'
                 and public.email_phrase('nonexistent.key','es')='nonexistent.key'
            then 'PASS' else 'FAIL' end
  as "E27 email_phrase falls back English then to the key itself";

-- Every template must exist in both languages, or someone gets English by
-- accident after adding a new one.
select case when count(*)=0 then 'PASS' else 'FAIL ('||string_agg(template_key,', ')||')' end
  as "E28 every template has both an en and an es row"
from (
  select template_key from public.email_templates
  group by template_key having count(distinct lang) <> 2
) missing;

select case when count(*)=0 then 'PASS' else 'FAIL ('||string_agg(phrase_key,', ')||')' end
  as "E29 every phrase has both an en and an es row"
from (
  select phrase_key from public.email_phrases
  group by phrase_key having count(distinct lang) <> 2
) missing;
