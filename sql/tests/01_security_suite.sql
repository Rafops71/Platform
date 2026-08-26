\pset pager off
\set QUIET on
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','OPERATOR@Example.com','{"first_name":"Rafael","last_name":"E","country":"BE","phone":"+32"}'),
 ('22222222-2222-2222-2222-222222222222','alice@example.com','{"first_name":"Alice","last_name":"A","country":"ZA","phone":"+27"}'),
 ('33333333-3333-3333-3333-333333333333','bob@example.com','{"first_name":"Bob","last_name":"B","country":"CN","phone":"+86"}'),
 ('44444444-4444-4444-4444-444444444444','mallory@example.com','{"first_name":"Mal","last_name":"M","country":"XX","phone":"+0"}');
update public.profiles set role='operator', status='approved' where email='operator@example.com';
update public.profiles set status='approved' where email in ('alice@example.com','bob@example.com');
\set QUIET off

\echo ''
\echo '=========== IDENTITY & ROLE RULES ==========='
select case when count(*)=4 then 'PASS' else 'FAIL' end as "T1 signup creates profile for every auth user" from public.profiles;
select case when bool_and(email=lower(email)) then 'PASS' else 'FAIL' end as "T2 emails normalised to lowercase" from public.profiles;
select case when role='operator' and status='approved' then 'PASS' else 'FAIL' end as "T3 SQL-Editor operator bootstrap works" from public.profiles where email='operator@example.com';

set role authenticated; set test.uid='44444444-4444-4444-4444-444444444444';
update public.profiles set role='operator', status='approved' where user_id='44444444-4444-4444-4444-444444444444';
update public.profiles set email='hijack@example.com' where user_id='44444444-4444-4444-4444-444444444444';
reset role; reset test.uid;
select case when role='participant' and status='pending' and email='mallory@example.com'
            then 'PASS' else 'FAIL (role='||role||' status='||status||' email='||email||')' end
       as "T4 participant cannot escalate role/status/email"
from public.profiles where user_id='44444444-4444-4444-4444-444444444444';

set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
update public.profiles set company='Alice Trading' where user_id='22222222-2222-2222-2222-222222222222';
reset role; reset test.uid;
select case when company='Alice Trading' then 'PASS' else 'FAIL' end as "T5 participant CAN edit own allowed fields"
from public.profiles where user_id='22222222-2222-2222-2222-222222222222';

set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
update public.profiles set status='approved' where email='mallory@example.com';
reset role; reset test.uid;
select case when status='approved' then 'PASS' else 'FAIL' end as "T6 operator CAN approve a participant"
from public.profiles where email='mallory@example.com';

\echo ''
\echo '=========== LISTINGS & ANONYMITY ==========='
\set QUIET on
set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
 select id,'sell','Copper Cathodes — Grade A',500,'MT','FOB','Zambia','available', public.next_reference('sell')
 from public.profiles where user_id='22222222-2222-2222-2222-222222222222';
reset role; reset test.uid;
set role authenticated; set test.uid='33333333-3333-3333-3333-333333333333';
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination, status, reference_number)
 select id,'buy','Copper Cathodes — Grade A',600,'MT','FOB','Zambia','available', public.next_reference('buy')
 from public.profiles where user_id='33333333-3333-3333-3333-333333333333';
reset role; reset test.uid;
\set QUIET off

select case when count(*)=2 then 'PASS' else 'FAIL' end as "T7 participants can create listings" from public.listings;
select string_agg(reference_number,', ' order by reference_number) as "T8 reference number format" from public.listings;

set role authenticated; set test.uid='33333333-3333-3333-3333-333333333333';
select case when count(*)=1 then 'PASS' else 'FAIL (saw '||count(*)||')' end
  as "T9 direct listings read shows ONLY own rows" from public.listings;
select case when count(*)=2 then 'PASS' else 'FAIL' end
  as "T10 get_public_listings shows all listings" from public.get_public_listings();
reset role; reset test.uid;

-- The anonymity guarantee, as confirmed 2026-08-26: participants see every
-- commercial detail of a listing and only the poster's identity is withheld.
-- This test used to assert the opposite for specification/price/notes — that
-- was the earlier, narrower rule, and sql/005 deliberately reversed it.
select case when (
    select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
     where json_object_keys in ('user_id','email','first_name','last_name','company','phone')
  ) = 0 then 'PASS' else 'FAIL' end as "T11a public view exposes no poster identity";

select case when (
    select count(*) from json_object_keys(to_json((select l from public.get_public_listings() l limit 1)))
     where json_object_keys in ('specification','price_conditions','price_unit','currency','notes','region')
  ) = 6 then 'PASS' else 'FAIL' end as "T11b public view exposes full commercial detail";

set role authenticated; set test.uid='44444444-4444-4444-4444-444444444444';
update public.listings set status='closed' where reference_number='SELL-26-001';
reset role; reset test.uid;
select case when status='available' then 'PASS' else 'FAIL' end
  as "T12 non-owner cannot modify another's listing" from public.listings where reference_number='SELL-26-001';

set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
\set QUIET on
savepoint sp1;
\set QUIET off
update public.listings set status='archived' where reference_number='SELL-26-001';
\echo '   (above error expected: participants may not set archived)'
\set QUIET on
rollback to sp1;
\set QUIET off
reset role; reset test.uid;
select case when status='available' then 'PASS' else 'FAIL' end
  as "T13 participant blocked from operator-only status" from public.listings where reference_number='SELL-26-001';

\echo ''
\echo '=========== MATCHING ENGINE ==========='
select score, count(*) as pairs from public.matches group by score;
select case when exists(select 1 from public.matches) then 'PASS' else 'FAIL' end as "T14 opposite-type same-commodity match generated";

\echo ''
\echo '=========== ACTIVITY LOG & NOTIFICATIONS ==========='
select action, count(*) from public.activity_log group by action order by action;
select case when exists(select 1 from public.activity_log where action='listing_created')
            then 'PASS' else 'FAIL' end as "T15 listing creation audited by the database";
select case when exists(
   select 1 from public.notifications n join public.profiles p on p.id=n.user_id
   where p.role='operator' and n.type='new_listing') then 'PASS' else 'FAIL' end
  as "T16 operators notified of new listings";
select case when exists(
   select 1 from public.notifications n join public.profiles p on p.id=n.user_id
   where n.type='registration_approved') then 'PASS' else 'FAIL' end
  as "T17 participant notified when approved";

\echo '=========== MAILBOX ANONYMITY (corrected) ==========='
\echo 'Bob obtains the listing id the way the real app does: get_public_listings(),'
\echo 'not a direct table read (which RLS correctly refuses him).'

set role authenticated; set test.uid='33333333-3333-3333-3333-333333333333';
select case when count(*)=1 then 'PASS' else 'FAIL' end
  as "T24a Bob can see SELL-26-001 only via the anonymous view"
from public.get_public_listings() where reference_number='SELL-26-001';

\set QUIET on
insert into public.messages (sender_id, listing_id, body)
 select p.id, g.id, 'I am interested in your copper.'
 from public.profiles p, public.get_public_listings() g
 where p.user_id='33333333-3333-3333-3333-333333333333' and g.reference_number='SELL-26-001';
\set QUIET off
select case when count(*)=1 then 'PASS' else 'FAIL' end as "T24b Bob's message was created" from public.messages;
reset role; reset test.uid;

set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
select case when count(*)=0 then 'PASS' else 'FAIL — leaked '||count(*) end
  as "T25 owner CANNOT read the message before it is forwarded" from public.messages;
reset role; reset test.uid;

set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
select case when count(*)=1 then 'PASS' else 'FAIL' end as "T26 operator CAN see the message" from public.messages;
\set QUIET on
insert into public.message_forward_log (message_id, operator_id, to_user_id)
 select m.id, o.id, a.id
 from public.messages m, public.profiles o, public.profiles a
 where o.user_id='11111111-1111-1111-1111-111111111111'
   and a.user_id='22222222-2222-2222-2222-222222222222';
\set QUIET off
reset role; reset test.uid;

set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
select case when count(*)=1 then 'PASS' else 'FAIL' end
  as "T27 owner CAN read it AFTER the operator forwards" from public.messages;
-- The anonymity guarantee: the forwarded message must not reveal who sent it.
select case when not exists (
    select 1 from public.messages m join public.profiles p on p.id=m.sender_id
  ) then 'PASS' else 'FAIL — sender profile is joinable' end
  as "T28 recipient cannot resolve the sender's identity";
reset role; reset test.uid;

\echo ''
\echo '--- who can read the activity log ---'
set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
select case when count(*)=0 then 'PASS' else 'FAIL — participant read '||count(*)||' log rows' end
  as "T29 participant CANNOT read the activity log" from public.activity_log;
reset role; reset test.uid;
set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
select case when count(*)>0 then 'PASS' else 'FAIL' end
  as "T30 operator CAN read the activity log" from public.activity_log;
select case when count(*)>0 then 'PASS' else 'FAIL' end
  as "T31 operator CAN read match suggestions" from public.matches;
reset role; reset test.uid;
set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
select case when count(*)=0 then 'PASS' else 'FAIL — participant saw matches' end
  as "T32 participant CANNOT read match suggestions" from public.matches;
reset role; reset test.uid;

\echo ''
\echo '=========== DOCUMENT CHECKLIST ==========='
set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
insert into public.document_checklist (listing_id, doc_type, indicated)
 select id,'Assay Report',true from public.listings where reference_number='SELL-26-001';
select case when count(*)=1 then 'PASS' else 'FAIL' end as "T33 owner can write own checklist" from public.document_checklist;
reset role; reset test.uid;
set role authenticated; set test.uid='33333333-3333-3333-3333-333333333333';
select case when count(*)=0 then 'PASS' else 'FAIL — leaked' end
  as "T34 other participant cannot read that checklist" from public.document_checklist;
select case when has_documents then 'PASS' else 'FAIL' end
  as "T35 but CAN see aggregate yes/no via anonymous view"
  from public.get_public_listings() where reference_number='SELL-26-001';
reset role; reset test.uid;
set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
select case when count(*)=1 then 'PASS' else 'FAIL' end as "T36 operator can read checklist detail" from public.document_checklist;
reset role; reset test.uid;

\pset pager off
\set QUIET on
insert into public.invitations (token, email, created_by)
 select 'valid-token-abc','new@example.com', id from public.profiles where role='operator';
insert into public.invitations (token, email, created_by, expires_at)
 select 'expired-token','old@example.com', id, now() - interval '1 day' from public.profiles where role='operator';
\set QUIET off

\echo '=========== INVITATION SECURITY ==========='
set role anon;
select case when count(*)=0 then 'PASS' else 'FAIL — anon read '||count(*)||' rows' end
  as "T18 anon CANNOT list the invitations table" from public.invitations;
select case when count(*)=1 then 'PASS' else 'FAIL' end
  as "T19 anon CAN validate one exact token via RPC" from public.get_invitation_by_token('valid-token-abc');
select case when count(*)=0 then 'PASS' else 'FAIL' end
  as "T20 wrong token returns nothing" from public.get_invitation_by_token('guessed-token');
reset role;

set role authenticated;
select case when count(*)=0 then 'PASS' else 'FAIL — participant read '||count(*) end
  as "T21 participant CANNOT list invitations" from public.invitations;
reset role;

set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
select case when count(*)=2 then 'PASS' else 'FAIL' end
  as "T22 operator CAN list invitations" from public.invitations;
reset role; reset test.uid;

\echo '--- expired token is rejected on use ---'
set role authenticated; set test.uid='44444444-4444-4444-4444-444444444444';
select public.mark_invitation_used('expired-token');
reset role; reset test.uid;

\echo '--- valid token consumed exactly once; second use rejected ---'
set role authenticated; set test.uid='44444444-4444-4444-4444-444444444444';
select public.mark_invitation_used('valid-token-abc') as first_use;
select public.mark_invitation_used('valid-token-abc') as second_use;
reset role; reset test.uid;

select case when used_at is not null then 'PASS' else 'FAIL' end
  as "T23 token marked used exactly once" from public.invitations where token='valid-token-abc';


\echo '=========== DOCUMENT REQUESTS ==========='
\set QUIET on
set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111';
insert into public.document_requests (listing_id, requester_id, participant_id, doc_type)
 select l.id, o.id, a.id, 'SGS report'
 from public.listings l, public.profiles o, public.profiles a
 where l.reference_number='SELL-26-001' and o.role='operator' and a.user_id='22222222-2222-2222-2222-222222222222';
reset role; reset test.uid;
\set QUIET off

set role authenticated; set test.uid='33333333-3333-3333-3333-333333333333';
select case when count(*)=0 then 'PASS' else 'FAIL' end
  as "T27 unrelated participant cannot see the request" from public.document_requests;
reset role; reset test.uid;

set role authenticated; set test.uid='22222222-2222-2222-2222-222222222222';
update public.document_requests set status='confirmed', responded_at=now(), doc_type='KYC', requester_id=participant_id;
reset role; reset test.uid;
select case when status='confirmed' and doc_type='SGS report' then 'PASS'
            else 'FAIL (status='||status||' doc_type='||doc_type||')' end
  as "T28 participant may respond but not rewrite the request" from public.document_requests;

select case when exists(select 1 from public.notifications n join public.profiles p on p.id=n.user_id
  where p.role='operator' and n.type='document_request_response') then 'PASS' else 'FAIL' end
  as "T29 operators notified of the response";
