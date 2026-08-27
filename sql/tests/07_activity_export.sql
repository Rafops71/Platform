-- 07_activity_export.sql
--
-- my_activity_export() is a SECURITY DEFINER function, which means it runs with
-- the privileges of its owner and RLS does not stand behind it. Everything that
-- keeps one participant out of another's record is written into the query
-- itself, so that is what these assertions check: two participants who have
-- both done the same kinds of things, each asking, and each getting only their
-- own.
--
-- The function takes no argument on purpose. There is no participant id for a
-- caller to substitute, which is the difference between a filter that can be
-- forgotten and one that cannot.

\set QUIET on
\pset pager off

\echo
\echo '=========== ACTIVITY EXPORT ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid,
  'exporter@example.invalid',
  jsonb_build_object('first_name', 'Ex', 'last_name', 'Porter',
                     'phone', '+3200000031', 'country', 'Belgium', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'::uuid,
  'exporter-other@example.invalid',
  jsonb_build_object('first_name', 'Ola', 'last_name', 'Otra',
                     'phone', '+3200000032', 'country', 'Spain', 'language', 'es')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3'::uuid,
  'exporter-op@example.invalid',
  jsonb_build_object('first_name', 'Owen', 'last_name', 'Operator',
                     'phone', '+3200000033', 'country', 'Belgium', 'language', 'en')
);

update public.profiles set status = 'approved'
where email like 'exporter%@example.invalid';
update public.profiles set role = 'operator' where email = 'exporter-op@example.invalid';

-- One listing each, so "my listings and not yours" has something to be wrong
-- about.
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
values ((select id from public.profiles where email = 'exporter@example.invalid'),
        'sell', 'Export Copper', 'FOB', 'Chile', 'SELL-EXPORT-MINE');

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
values ((select id from public.profiles where email = 'exporter-other@example.invalid'),
        'sell', 'Export Cobalt', 'FOB', 'Peru', 'SELL-EXPORT-THEIRS');

insert into public.messages (sender_id, listing_id, body, status)
values ((select id from public.profiles where email = 'exporter@example.invalid'),
        (select id from public.listings where reference_number = 'SELL-EXPORT-THEIRS'),
        'My own enquiry', 'pending_review');

insert into public.messages (sender_id, listing_id, body, status)
values ((select id from public.profiles where email = 'exporter-other@example.invalid'),
        (select id from public.listings where reference_number = 'SELL-EXPORT-MINE'),
        'Somebody else enquiry', 'pending_review');

-- A message an Operator forwarded to the exporter: theirs to see, but not a row
-- they own, which is the case a naive "where sender_id = me" would miss.
insert into public.message_forward_log (message_id, operator_id, to_user_id)
values ((select id from public.messages where body = 'Somebody else enquiry'),
        (select id from public.profiles where email = 'exporter-op@example.invalid'),
        (select id from public.profiles where email = 'exporter@example.invalid'));

insert into public.document_requests (listing_id, requester_id, participant_id, doc_type, status, responded_at)
values ((select id from public.listings where reference_number = 'SELL-EXPORT-MINE'),
        (select id from public.profiles where email = 'exporter-op@example.invalid'),
        (select id from public.profiles where email = 'exporter@example.invalid'),
        'Certificate of Origin', 'confirmed', now());

set role authenticated; set test.uid='d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
update public.profiles set phone = '+3288888888'
 where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'::uuid;
reset role; reset test.uid;

\echo
\echo '=========== EVERYTHING OF MINE IS IN IT ==========='

set role authenticated; set test.uid='d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 my own listing is exported"
from public.my_activity_export()
where category = 'listing' and reference = 'SELL-EXPORT-MINE';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 a message I sent is exported"
from public.my_activity_export()
where category = 'message_sent' and detail = 'My own enquiry';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 a message forwarded to me is exported, though I do not own the row"
from public.my_activity_export()
where category = 'message_received' and detail = 'Somebody else enquiry';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 a document request is exported"
from public.my_activity_export()
where category = 'document_request' and detail = 'Certificate of Origin';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 my answer to it is exported separately"
from public.my_activity_export()
where category = 'document_response' and status = 'confirmed';

select case when count(*) >= 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 a profile change is exported, naming the field"
from public.my_activity_export()
where category = 'profile_change' and detail like '%phone%';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T7 rows are dated"
from public.my_activity_export() where occurred_at is null;

\echo
\echo '=========== AND NOTHING OF ANYBODY ELSE ==========='

select case when count(*) = 0 then 'PASS' else 'FAIL leaked ' || count(*) || ' rows' end
  as "T8 another participant's listing is not in my export"
from public.my_activity_export() where reference = 'SELL-EXPORT-THEIRS' and category = 'listing';

-- The enquiry they sent about MY listing is theirs, not mine. It reaches me
-- only if an Operator forwards it, and nobody did.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T9 a message somebody else sent is not exported as mine"
from public.my_activity_export()
where category = 'message_sent' and detail = 'Somebody else enquiry';

reset role; reset test.uid;

set role authenticated; set test.uid='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';

select case when count(*) = 0 then 'PASS' else 'FAIL leaked ' || count(*) || ' rows' end
  as "T10 the other participant's export contains none of my listings"
from public.my_activity_export() where reference = 'SELL-EXPORT-MINE' and category = 'listing';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T11 it does contain their own"
from public.my_activity_export() where reference = 'SELL-EXPORT-THEIRS' and category = 'listing';

-- The forward went to the exporter, so the sender does not get it back as a
-- received message on top of the sent one.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T12 a forward to someone else is not in the sender's export"
from public.my_activity_export() where category = 'message_received';

reset role; reset test.uid;

-- An Operator is not a special case: the function answers for whoever calls it,
-- and an Operator has their own activity like anyone else. What matters is that
-- being an Operator does not turn it into everybody's activity.
set role authenticated; set test.uid='d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3';

select case when count(*) = 0 then 'PASS' else 'FAIL leaked ' || count(*) || ' rows' end
  as "T13 an Operator's own export does not contain participants' listings"
from public.my_activity_export() where category = 'listing';

select case when count(*) = 0 then 'PASS' else 'FAIL leaked ' || count(*) || ' rows' end
  as "T14 nor their messages"
from public.my_activity_export() where category like 'message%';

reset role; reset test.uid;
