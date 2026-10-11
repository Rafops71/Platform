-- 13_profile_deletion.sql
--
-- Proves sql/018: a member who has used the platform can be deleted, and what
-- goes with them is their own content while the record of what happened stays.
--
-- Before 018 this was impossible. Nine foreign keys pointing at profiles sat at
-- NO ACTION, so the first referencing row refused the delete — and signing in
-- writes to activity_log, which made every member who had ever signed in
-- undeletable. The live symptom was HTTP 500 from the Auth admin API and
-- "Database error loading user" in the dashboard.
--
-- Teardown is the thing being proven here, so the fixture is deliberately a
-- member who has done everything: posted a listing, declared documents, sent a
-- message, had it forwarded, saved a search, accepted the Terms, been invited
-- and left activity behind. A deletion test on an empty account proves nothing,
-- because an empty account was never the one that failed.

\set QUIET on
\pset pager off

\echo
\echo '=========== A MEMBER WHO HAS USED THE PLATFORM CAN BE DELETED ==========='

-- The operator who invites, forwards and requests.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'd0d0d0d0-0000-4000-8000-00000000000a'::uuid,
  'del-operator@example.invalid',
  jsonb_build_object('first_name', 'Dana', 'last_name', 'Leaver',
                     'phone', '+3200000061', 'country', 'Belgium', 'language', 'en')
);

-- The member who will be deleted.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'd0d0d0d0-0000-4000-8000-00000000000b'::uuid,
  'del-member@example.invalid',
  jsonb_build_object('first_name', 'Mira', 'last_name', 'Goingaway',
                     'phone', '+3200000062', 'country', 'Spain', 'language', 'en')
);

-- The counterparty, who must survive untouched.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'd0d0d0d0-0000-4000-8000-00000000000c'::uuid,
  'del-other@example.invalid',
  jsonb_build_object('first_name', 'Staya', 'last_name', 'Remaining',
                     'phone', '+3200000063', 'country', 'Chile', 'language', 'en')
);

update public.profiles set status = 'approved'
where email in ('del-operator@example.invalid', 'del-member@example.invalid',
                'del-other@example.invalid');
update public.profiles set role = 'operator'
where email = 'del-operator@example.invalid';

-- Their listing, and the counterparty's, so the blast radius is visible.
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
values ((select id from public.profiles where email = 'del-member@example.invalid'),
        'sell', 'Zinc Ingots', 'FOB', 'Spain', 'SELL-DEL-MINE');

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
values ((select id from public.profiles where email = 'del-other@example.invalid'),
        'sell', 'Iron Ore', 'CIF', 'Chile', 'SELL-DEL-THEIRS');

-- A declared document against their listing.
insert into public.document_checklist (listing_id, doc_type, indicated)
values ((select id from public.listings where reference_number = 'SELL-DEL-MINE'),
        'Assay Report', true);

-- An operator document request naming them.
insert into public.document_requests (listing_id, participant_id, requester_id, doc_type)
values ((select id from public.listings where reference_number = 'SELL-DEL-MINE'),
        (select id from public.profiles where email = 'del-member@example.invalid'),
        (select id from public.profiles where email = 'del-operator@example.invalid'),
        'Certificate of Origin');

-- An enquiry they sent about the counterparty's listing, and the forwarding
-- record for it.
insert into public.messages (sender_id, listing_id, body)
values ((select id from public.profiles where email = 'del-member@example.invalid'),
        (select id from public.listings where reference_number = 'SELL-DEL-THEIRS'),
        'Deletion fixture: enquiry from the member who will be removed');

insert into public.message_forward_log (message_id, operator_id, to_user_id)
values ((select id from public.messages
          where body = 'Deletion fixture: enquiry from the member who will be removed'),
        (select id from public.profiles where email = 'del-operator@example.invalid'),
        (select id from public.profiles where email = 'del-other@example.invalid'));

-- A message the counterparty sent about the departing member's listing. This
-- one must SURVIVE the deletion, with its listing reference emptied: it is the
-- counterparty's record of the conversation as much as anyone's.
insert into public.messages (sender_id, listing_id, body)
values ((select id from public.profiles where email = 'del-other@example.invalid'),
        (select id from public.listings where reference_number = 'SELL-DEL-MINE'),
        'Deletion fixture: the counterparty asked about the departing listing');

-- An invitation the operator issued and the member used.
insert into public.invitations (email, token, created_by, used_by, expires_at, used_at)
values ('del-invited@example.invalid', 'del-token-0001',
        (select id from public.profiles where email = 'del-operator@example.invalid'),
        (select id from public.profiles where email = 'del-member@example.invalid'),
        now() + interval '7 days', now());

-- A commodity the departing member added. Shared reference data: the list must
-- not lose a traded commodity because the person who typed it in left.
insert into public.commodities (name, created_by, sort_order)
values ('Deletion Fixture Ore',
        (select id from public.profiles where email = 'del-member@example.invalid'),
        9001);

-- Saved search and an activity row, the two that bit hardest in practice.
-- saved_searches stores the criteria and not a label: sql/012 composes the
-- label at render time so it can be shown in either language. So the marker
-- for this fixture goes in region, which is a criterion.
insert into public.saved_searches (user_id, commodity, region)
values ((select id from public.profiles where email = 'del-member@example.invalid'),
        'Zinc Ingots', 'Deletion Fixture Region');

insert into public.activity_log (user_id, action)
values ((select id from public.profiles where email = 'del-member@example.invalid'),
        'login');

-- The fixture is only worth something if it really is the hard case.
select case when count(*) >= 1 then 'PASS' else 'FAIL' end
  as "T1 the fixture has activity, the row that used to block every delete"
from public.activity_log
where user_id = (select id from public.profiles where email = 'del-member@example.invalid');

-- ------------------------------------------------------------- the delete --

-- Not wrapped in anything that would hide a failure: if a foreign key still
-- refuses, this statement raises and the suite reports it.
delete from public.profiles where email = 'del-member@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T2 Item53 the member is gone"
from public.profiles where email = 'del-member@example.invalid';

-- ------------------------------------------- what belonged to them is gone --

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 Item53 their listing is gone"
from public.listings where reference_number = 'SELL-DEL-MINE';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 Item53 the documents declared against their listing are gone"
from public.document_checklist dc
where not exists (select 1 from public.listings l where l.id = dc.listing_id);

-- Asked as an invariant, not by doc_type. The first version of this counted
-- every document_requests row with doc_type 'Certificate of Origin' and found
-- one — belonging to an earlier suite in this same database. A deletion test
-- must ask whether anything is left DANGLING, not whether a common value
-- appears anywhere.
select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 Item53 no document request is left pointing at something deleted"
from public.document_requests dr
where not exists (select 1 from public.profiles p where p.id = dr.participant_id)
   or not exists (select 1 from public.profiles p where p.id = dr.requester_id)
   or not exists (select 1 from public.listings l where l.id = dr.listing_id);

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 Item53 the message they sent is gone"
from public.messages
where body = 'Deletion fixture: enquiry from the member who will be removed';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 Item53 the forwarding record for their message is gone"
from public.message_forward_log mfl
where not exists (select 1 from public.messages m where m.id = mfl.message_id);

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 Item53 their saved search is gone"
from public.saved_searches where region = 'Deletion Fixture Region';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T9 Item53 no row anywhere still points at the deleted member"
from (
  select 1 from public.listings l
    where not exists (select 1 from public.profiles p where p.id = l.user_id)
  union all
  select 1 from public.messages m
    where not exists (select 1 from public.profiles p where p.id = m.sender_id)
  union all
  select 1 from public.saved_searches s
    where not exists (select 1 from public.profiles p where p.id = s.user_id)
) orphans;

-- --------------------------------------- the record of what happened stays --

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 Item53 the activity row survives with the person unlinked"
from public.activity_log
where action = 'login' and user_id is null;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T11 Item53 a commodity they added stays on the shared list"
from public.commodities where name = 'Deletion Fixture Ore' and created_by is null;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T12 Item53 the invitation they used is kept, with the acceptor unlinked"
from public.invitations where token = 'del-token-0001' and used_by is null;

-- ------------------------------------------- the counterparty is untouched --

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T13 Item53 the counterparty's own listing is untouched"
from public.listings where reference_number = 'SELL-DEL-THEIRS';

-- The half of the conversation the counterparty wrote is theirs, not the
-- departing member's. Cascading from listings would have deleted it along with
-- the listing it asked about.
select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T14 Item53 the counterparty's message survives, its listing unlinked"
from public.messages
where body = 'Deletion fixture: the counterparty asked about the departing listing'
  and listing_id is null;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T15 Item53 the counterparty's profile is untouched"
from public.profiles where email = 'del-other@example.invalid';
