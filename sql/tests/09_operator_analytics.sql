-- 09_operator_analytics.sql
--
-- The analytics series is platform-wide counts, which is the one thing on this
-- platform that no participant should be able to derive. The function is
-- SECURITY DEFINER, so the refusal has to be written into it - and that is the
-- first thing asserted here.
--
-- The rest is about what a count means. "Reviewed" is stamped when the status
-- leaves its unreviewed value, so the work lands in the period it was done in
-- rather than the period it arrived in, and a row reviewed twice is not counted
-- twice.

\set QUIET on
\pset pager off

\echo
\echo '=========== OPERATOR ANALYTICS ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'::uuid,
  'analytics-op@example.invalid',
  jsonb_build_object('first_name', 'Ana', 'last_name', 'Lytics',
                     'phone', '+3200000051', 'country', 'Belgium', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'::uuid,
  'analytics-participant@example.invalid',
  jsonb_build_object('first_name', 'Pia', 'last_name', 'Participant',
                     'phone', '+3200000052', 'country', 'Spain', 'language', 'en')
);

update public.profiles set status = 'approved'
where email like 'analytics-%@example.invalid';
update public.profiles set role = 'operator' where email = 'analytics-op@example.invalid';

\echo
\echo '=========== WHO MAY ASK ==========='

set role authenticated; set test.uid='f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';
savepoint before_participant_call;
select public.operator_analytics('week', 4);
rollback to savepoint before_participant_call;
reset role; reset test.uid;
\echo '   (above error expected: participants may not read platform-wide counts)'

set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';

select case when count(*) = 4 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 an Operator gets one row per period asked for"
from public.operator_analytics('week', 4);

-- Empty periods are rows too. Without them a table of counts has gaps that read
-- as missing data rather than as a quiet week.
select case when count(*) = 12 then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 periods with no activity are still returned"
from public.operator_analytics('week', 12);

select case when count(*) = 6 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 the bucket can be months"
from public.operator_analytics('month', 6);

-- p_periods is clamped rather than trusted: a caller asking for ten thousand
-- periods gets the maximum, not a query that scans forever.
select case when count(*) = 52 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 an absurd period count is clamped"
from public.operator_analytics('week', 10000);

-- An unrecognised bucket falls back to weeks rather than reaching date_trunc().
select case when count(*) = 3 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 an unknown bucket is not passed through to the query"
from public.operator_analytics('; drop table public.profiles; --', 3);

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T6 the profiles table is still there"
from information_schema.tables where table_schema = 'public' and table_name = 'profiles';

reset role; reset test.uid;

\echo
\echo '=========== WHAT THE COUNTS COUNT ==========='

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
values ((select id from public.profiles where email = 'analytics-participant@example.invalid'),
        'sell', 'Analytics Copper', 'FOB', 'Chile', 'SELL-ANALYTICS-1');

insert into public.messages (sender_id, listing_id, body, status)
values ((select id from public.profiles where email = 'analytics-participant@example.invalid'),
        (select id from public.listings where reference_number = 'SELL-ANALYTICS-1'),
        'Analytics enquiry', 'pending_review');

set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';

select case when sum(registrations) >= 2 then 'PASS' else 'FAIL got ' || coalesce(sum(registrations), 0) end
  as "T7 registrations are counted"
from public.operator_analytics('week', 12);

select case when sum(listings) >= 1 then 'PASS' else 'FAIL got ' || coalesce(sum(listings), 0) end
  as "T8 new listings are counted"
from public.operator_analytics('week', 12);

-- Pending work is not reviewed work.
select case when coalesce(sum(messages_reviewed), 0) = 0 then 'PASS' else 'FAIL got ' || sum(messages_reviewed) end
  as "T9 a message still awaiting review counts in no period"
from public.operator_analytics('week', 12);

reset role; reset test.uid;

update public.messages set status = 'forwarded' where body = 'Analytics enquiry';

select case when reviewed_at is not null then 'PASS' else 'FAIL' end
  as "T10 acting on a message stamps when it was reviewed"
from public.messages where body = 'Analytics enquiry';

set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
select case when sum(messages_reviewed) = 1 then 'PASS' else 'FAIL got ' || coalesce(sum(messages_reviewed), 0) end
  as "T11 and it is counted in the period it was reviewed in"
from public.operator_analytics('week', 12);
reset role; reset test.uid;

-- Reclassifying a message later is not a second review.
update public.messages set status = 'replied' where body = 'Analytics enquiry';

set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
select case when sum(messages_reviewed) = 1 then 'PASS' else 'FAIL got ' || coalesce(sum(messages_reviewed), 0) end
  as "T12 reviewing the same message twice is still one review"
from public.operator_analytics('week', 12);
reset role; reset test.uid;

insert into public.message_forward_log (message_id, operator_id, to_user_id)
values ((select id from public.messages where body = 'Analytics enquiry'),
        (select id from public.profiles where email = 'analytics-op@example.invalid'),
        (select id from public.profiles where email = 'analytics-participant@example.invalid'));

-- Compared against the table rather than against a literal: earlier suites in
-- this same database have forwarded messages of their own, and the series is
-- platform-wide by design.
set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
select case when (select sum(introductions) from public.operator_analytics('week', 12))
                 = (select count(*) from public.message_forward_log)
            then 'PASS' else 'FAIL' end
  as "T13 every introduction made is counted exactly once";
reset role; reset test.uid;

-- The matching engine writes its own rows, so this uses whatever it produced
-- rather than inventing a pair.
insert into public.listings (user_id, type, commodity, incoterm, destination, reference_number)
values ((select id from public.profiles where email = 'analytics-participant@example.invalid'),
        'buy', 'Analytics Copper', 'FOB', 'Spain', 'BUY-ANALYTICS-1');

update public.matches set status = 'reviewed'
where listing_a_id in (select id from public.listings where reference_number like '%ANALYTICS%')
   or listing_b_id in (select id from public.listings where reference_number like '%ANALYTICS%');

set role authenticated; set test.uid='f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
select case when sum(matches_reviewed) >= 1 then 'PASS' else 'FAIL got ' || coalesce(sum(matches_reviewed), 0) end
  as "T14 a reviewed match is counted"
from public.operator_analytics('week', 12);
reset role; reset test.uid;

-- Nothing in the series names anybody. It is counts, and counts only: the
-- columns are integers and a date, so there is no identity for it to leak.
select case when (select count(*) from unnest(proargmodes) m where m = 't') = 6
            then 'PASS' else 'FAIL' end
  as "T15 the series returns six columns, a date and five counts"
from pg_proc where proname = 'operator_analytics';

select case when pg_get_function_result('public.operator_analytics(text,int)'::regprocedure)
                 !~* '(email|name|phone|company|body|profile)'
            then 'PASS' else 'FAIL' end
  as "T16 and not one of them could carry an identity";
