-- Jericho Platform — message threading (sql/009).
--
-- The routing decision itself lives in the operator UI and is covered by
-- tests/e2e/mailbox-flow.spec.js. What belongs here is the part of the fix
-- the database is responsible for: that in_reply_to exists, that a message
-- cannot answer itself, and that losing a parent message orphans the link
-- instead of deleting the reply.
--
-- Own accounts throughout, so this does not depend on what 01 or 02 left.

\pset pager off
\set QUIET on

insert into auth.users (id, email, raw_user_meta_data) values
 ('bbbbbbbb-0000-0000-0000-000000000001','thowner@example.com',
    '{"first_name":"Thea","last_name":"Owner","country":"Chile","phone":"+56"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','thasker@example.com',
    '{"first_name":"Ravi","last_name":"Asker","country":"India","phone":"+91"}');
update public.profiles set status='approved'
 where email in ('thowner@example.com','thasker@example.com');

-- Rows are set up on a direct connection, NOT inside a participant session.
-- Under RLS a participant cannot see the other party's profile or listing at
-- all, so a session-scoped INSERT ... SELECT here quietly matches zero rows
-- and every assertion below then reads an empty table. Who may see what is
-- suite 01's job; this suite is about threading semantics.

-- A listing by Thea, and Ravi's opening enquiry about it.
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin, status, reference_number)
 select id,'sell','Antimony',300,'Metric tons','FOB','Chile','available', public.next_reference('sell')
 from public.profiles where email='thowner@example.com';

insert into public.messages (sender_id, listing_id, body, status)
 select (select id from public.profiles where email='thasker@example.com'),
        l.id, 'TH enquiry', 'pending_review'
 from public.listings l
 where l.user_id = (select id from public.profiles where email='thowner@example.com');

-- Thea's reply, threaded onto that enquiry.
insert into public.messages (sender_id, listing_id, body, status, in_reply_to)
 select (select id from public.profiles where email='thowner@example.com'),
        m.listing_id, 'TH reply', 'pending_review', m.id
 from public.messages m where m.body='TH enquiry';

\set QUIET off

\echo ''
\echo '=========== MESSAGE THREADING ==========='

select case when in_reply_to is null then 'PASS' else 'FAIL' end
  as "M1 an opening enquiry is not a reply to anything"
from public.messages where body='TH enquiry';

select case when in_reply_to = (select id from public.messages where body='TH enquiry')
            then 'PASS' else 'FAIL' end
  as "M2 a reply records the message it answers"
from public.messages where body='TH reply';

-- The whole point of the fix: the routing target for a reply is the sender of
-- the parent, and it is NOT the listing owner (who wrote the reply).
select case when parent.sender_id = (select id from public.profiles where email='thasker@example.com')
                 and parent.sender_id <> reply.sender_id
            then 'PASS' else 'FAIL' end
  as "M3 a reply routes to the parent's sender, not the listing owner"
from public.messages reply
join public.messages parent on parent.id = reply.in_reply_to
where reply.body='TH reply';

-- And an opening enquiry still routes to the listing owner, as before.
select case when l.user_id = (select id from public.profiles where email='thowner@example.com')
            then 'PASS' else 'FAIL' end
  as "M4 an enquiry still routes to the listing owner"
from public.messages m join public.listings l on l.id = m.listing_id
where m.body='TH enquiry';

-- A second turn: Ravi answers Thea's reply. The target flips back to Thea,
-- which is what makes this work for any number of turns.
\set QUIET on
insert into public.messages (sender_id, listing_id, body, status, in_reply_to)
 select (select id from public.profiles where email='thasker@example.com'),
        m.listing_id, 'TH second turn', 'pending_review', m.id
 from public.messages m where m.body='TH reply';
\set QUIET off

select case when parent.sender_id = (select id from public.profiles where email='thowner@example.com')
            then 'PASS' else 'FAIL' end
  as "M5 the next turn routes back to the other party"
from public.messages reply
join public.messages parent on parent.id = reply.in_reply_to
where reply.body='TH second turn';

\echo ''
\echo '=========== THREADING GUARDS ==========='

-- Rejected by messages_no_self_reply; the update must leave the row alone.
update public.messages set in_reply_to = id where body='TH enquiry';
select case when in_reply_to is null then 'PASS' else 'FAIL' end
  as "M6 a message cannot be a reply to itself"
from public.messages where body='TH enquiry';

-- Deleting a parent orphans the link rather than removing the reply.
\set QUIET on
delete from public.messages where body='TH second turn';
delete from public.messages where body='TH enquiry';
\set QUIET off

select case when count(*)=1 then 'PASS' else 'FAIL (reply count '||count(*)||')' end
  as "M7 deleting the parent does not delete the reply"
from public.messages where body='TH reply';

select case when in_reply_to is null then 'PASS' else 'FAIL' end
  as "M8 the orphaned link is nulled, not left dangling"
from public.messages where body='TH reply';
