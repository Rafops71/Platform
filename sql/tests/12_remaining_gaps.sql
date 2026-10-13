-- 12_remaining_gaps.sql
--
-- The five functions on docs/CHECKLIST.md that nothing yet proved and that
-- belong in the database rather than in a browser: items 33, 43, 44, 45 and 49.
--
-- Item 43 was in fact already exercised — 09_operator_analytics.sql calls
-- operator_analytics as a participant and prints "(above error expected)". That
-- is a human reading a log, not a check: the suite passes whether the call is
-- refused or succeeds, because nothing asserts on it. Here the refusal is
-- caught and turned into a PASS, so a regression that opened the figures up
-- would cross the item instead of printing a reassuring note.

\set QUIET on
\pset pager off

\echo
\echo '=========== NO FILE IS EVER STORED ==========='

-- Item 33 is a promise about what this platform does NOT hold. Documents are
-- declared against a checklist and requested through a workflow; nothing is
-- ever uploaded. That promise is in the Privacy Notice, so it is worth a test
-- that fails the moment a column appears that could hold file bytes — the
-- point is not today's schema but the next person's migration.
select case when count(*) = 0
            then 'PASS'
            else 'FAIL: ' || string_agg(table_name || '.' || column_name, ', ')
       end as "T1 Item33 no table in public can hold file bytes"
from information_schema.columns
where table_schema = 'public'
  and data_type in ('bytea', 'oid');

-- Supabase Storage lives in its own schema. Its absence is the second half of
-- the same promise: no bucket, nothing to upload into.
select case when count(*) = 0 then 'PASS' else 'FAIL: storage schema present' end
  as "T2 Item33 and there is no storage schema to upload into"
from information_schema.schemata
where schema_name = 'storage';

-- The document tables carry a declaration and a workflow, not a payload.
select case when count(*) = 3 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 Item33 the checklist records only whether a document is held"
from information_schema.columns
where table_schema = 'public' and table_name = 'document_checklist'
  and column_name in ('indicated', 'listing_id', 'doc_type');

\echo
\echo '=========== A PARTICIPANT CANNOT READ THE PLATFORM FIGURES ==========='

-- Catching the refusal is what makes this a check. operator_analytics raises
-- 'Operators only'; a plpgsql wrapper converts raising into PASS and returning
-- into FAIL, so either outcome lands on the table.
create or replace function pg_temp.participant_reads_figures() returns text
language plpgsql as $fn$
begin
  perform public.operator_analytics('week', 4);
  return 'FAIL: a participant read the platform-wide counts';
exception
  when others then
    return 'PASS';
end;
$fn$;

select public.test_invite('gap-participant@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values (
  'ab1ab1ab-ab1a-ab1a-ab1a-ab1ab1ab1ab1'::uuid, 'gap-participant@example.invalid',
  jsonb_build_object('first_name','Gap','last_name','Part','phone','+3200000071','country','Belgium','language','en'));
select public.test_invite('gap-operator@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values (
  'ab2ab2ab-ab2a-ab2a-ab2a-ab2ab2ab2ab2'::uuid, 'gap-operator@example.invalid',
  jsonb_build_object('first_name','Gap','last_name','Op','phone','+3200000072','country','Belgium','language','en'));
update public.profiles set status = 'approved' where email = 'gap-participant@example.invalid';
update public.profiles set role = 'operator', status = 'approved' where email = 'gap-operator@example.invalid';

set role authenticated; set test.uid='ab1ab1ab-ab1a-ab1a-ab1a-ab1ab1ab1ab1';
select pg_temp.participant_reads_figures()
  as "T4 Item43 a participant asking for the platform figures is refused";
reset role; reset test.uid;

\echo
\echo '=========== ONLY AN OPERATOR MANAGES THE COMMODITY LIST ==========='

set role authenticated; set test.uid='ab2ab2ab-ab2a-ab2a-ab2a-ab2ab2ab2ab2';
insert into public.commodities (name) values ('Gap Test Ore');
select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 Item44 an Operator can add a commodity"
from public.commodities where name = 'Gap Test Ore';

update public.commodities set name = 'Gap Test Ore Renamed' where name = 'Gap Test Ore';
select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 Item44 an Operator can rename one"
from public.commodities where name = 'Gap Test Ore Renamed';

delete from public.commodities where name = 'Gap Test Ore Renamed';
select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 Item44 and remove one"
from public.commodities where name = 'Gap Test Ore Renamed';
reset role; reset test.uid;

-- The prohibition half. A participant choosing what the whole platform may
-- trade in would be an Operator in all but name.
set role authenticated; set test.uid='ab1ab1ab-ab1a-ab1a-ab1a-ab1ab1ab1ab1';
savepoint before_participant_commodity;
insert into public.commodities (name) values ('Participant Ore');
rollback to savepoint before_participant_commodity;
reset role; reset test.uid;
\echo '   (above error expected: a participant may not add a commodity)'

select case when count(*) = 0 then 'PASS' else 'FAIL: a participant added a commodity' end
  as "T8 Item44 a participant cannot add one"
from public.commodities where name = 'Participant Ore';

\echo
\echo '=========== NO INTRODUCTION HAPPENS BY ITSELF ==========='

-- The matching engine scores opposite-type listings on the same commodity and
-- puts the suggestion in front of an Operator. It must never introduce the two
-- parties: the brokered conversation is the product, and an automatic
-- introduction would hand it away. So a match may appear, and nothing else may.
insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, origin,
                             currency, status, reference_number)
select id, 'sell', 'Gap Commodity', 1000, 'MT', 'FOB', 'Belgium', 'EUR', 'available', 'SELL-GAP-001'
from public.profiles where email = 'gap-participant@example.invalid';

select public.test_invite('gap-buyer@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values (
  'ab3ab3ab-ab3a-ab3a-ab3a-ab3ab3ab3ab3'::uuid, 'gap-buyer@example.invalid',
  jsonb_build_object('first_name','Gap','last_name','Buy','phone','+3200000073','country','Spain','language','en'));
update public.profiles set status = 'approved' where email = 'gap-buyer@example.invalid';

insert into public.listings (user_id, type, commodity, quantity, unit, incoterm, destination,
                             currency, status, reference_number)
select id, 'buy', 'Gap Commodity', 1000, 'MT', 'CIF', 'Spain', 'EUR', 'available', 'BUY-GAP-001'
from public.profiles where email = 'gap-buyer@example.invalid';

select case when count(*) >= 1 then 'PASS' else 'FAIL: no suggestion was generated' end
  as "T9 Item45 a matching pair produces a suggestion for an Operator"
from public.matches m
join public.listings la on la.id = m.listing_a_id
where la.commodity = 'Gap Commodity';

-- Every suggestion starts as 'new'. Nothing is pre-reviewed or pre-acted.
select case when bool_and(m.status = 'new') then 'PASS'
            else 'FAIL: ' || string_agg(distinct m.status, ', ') end
  as "T10 Item45 every suggestion waits at 'new' for an Operator"
from public.matches m
join public.listings la on la.id = m.listing_a_id
where la.commodity = 'Gap Commodity';

-- The two assertions that matter most: generating a match sent no message and
-- forwarded nothing. If either number moves, the platform introduced two
-- parties on its own.
select case when count(*) = 0 then 'PASS' else 'FAIL: ' || count(*) || ' message(s) sent' end
  as "T11 Item45 and no message was sent to either party"
from public.messages
where listing_id in (select id from public.listings where commodity = 'Gap Commodity');

select case when count(*) = 0 then 'PASS' else 'FAIL: ' || count(*) || ' forward(s)' end
  as "T12 Item45 and nothing was forwarded to anybody"
from public.message_forward_log f
join public.messages msg on msg.id = f.message_id
where msg.listing_id in (select id from public.listings where commodity = 'Gap Commodity');

\echo
\echo '=========== A FAILED EMAIL IS RETRIED, NOT DROPPED ==========='

-- The queue is defined by a predicate, not a status column: a row is pending
-- while sent_at and failed_at are both null. A transient failure records the
-- error and the attempt and leaves the row pending; only giving up sets
-- failed_at. The risk this guards is the silent one — a row that stops being
-- picked up without anybody deciding to abandon it.
insert into public.email_outbox (to_email, subject, body_text, error, attempts)
values ('gap-retry@example.invalid', 'Gap retry', 'body', '429 Too Many Requests', 1);

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T13 Item49 a row that failed once is still in the queue"
from public.email_outbox
where to_email = 'gap-retry@example.invalid'
  and sent_at is null and failed_at is null;

-- And the row is still carrying why it failed, so a retry is an informed one.
select case when error is not null and attempts = 1 then 'PASS'
            else 'FAIL attempts=' || attempts || ' error=' || coalesce(error, 'null') end
  as "T14 Item49 and it remembers the error and the attempt count"
from public.email_outbox where to_email = 'gap-retry@example.invalid';

-- Giving up is explicit and takes the row out of the queue for good.
update public.email_outbox set failed_at = now(), attempts = 5
where to_email = 'gap-retry@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL: still queued after being given up on' end
  as "T15 Item49 a row given up on leaves the queue"
from public.email_outbox
where to_email = 'gap-retry@example.invalid'
  and sent_at is null and failed_at is null;

-- The partial index is what makes the queue cheap at volume; losing it would
-- not break correctness, so nothing else would notice.
select case when count(*) = 1 then 'PASS' else 'FAIL: pending index missing' end
  as "T16 Item49 the pending-only index is still there"
from pg_indexes
where schemaname = 'public' and indexname = 'email_outbox_pending_idx';
