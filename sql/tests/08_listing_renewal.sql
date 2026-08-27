-- 08_listing_renewal.sql
--
-- renew_listing() is a timestamp and an ownership check, and the ownership
-- check is the whole of it. The function is SECURITY DEFINER, so RLS is not
-- standing behind it: if it renewed by id alone, any participant could keep any
-- listing looking fresh, including one they have never seen.
--
-- The other thing worth pinning is that updated_at cannot be written directly.
-- It is what decides whether a listing is stale, and a participant with a
-- dormant offer has an obvious reason to want it to say something else.

\set QUIET on
\pset pager off

\echo
\echo '=========== LISTING RENEWAL ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'::uuid,
  'renewer@example.invalid',
  jsonb_build_object('first_name', 'Rena', 'last_name', 'Newer',
                     'phone', '+3200000041', 'country', 'Belgium', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2'::uuid,
  'renew-other@example.invalid',
  jsonb_build_object('first_name', 'Oleg', 'last_name', 'Other',
                     'phone', '+3200000042', 'country', 'Spain', 'language', 'en')
);

update public.profiles set status = 'approved'
where email in ('renewer@example.invalid', 'renew-other@example.invalid');

-- A listing last touched 45 days ago: stale by the platform's definition.
insert into public.listings (user_id, type, commodity, incoterm, origin,
                             reference_number, created_at, updated_at)
values ((select id from public.profiles where email = 'renewer@example.invalid'),
        'sell', 'Renewal Copper', 'FOB', 'Chile', 'SELL-RENEW-MINE',
        now() - interval '50 days', now() - interval '45 days');

insert into public.listings (user_id, type, commodity, incoterm, origin,
                             reference_number, created_at, updated_at)
values ((select id from public.profiles where email = 'renew-other@example.invalid'),
        'sell', 'Renewal Cobalt', 'FOB', 'Peru', 'SELL-RENEW-THEIRS',
        now() - interval '50 days', now() - interval '45 days');

select case when updated_at < now() - interval '30 days' then 'PASS' else 'FAIL' end
  as "T1 the fixture starts out stale"
from public.listings where reference_number = 'SELL-RENEW-MINE';

set role authenticated; set test.uid='e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
select public.renew_listing((select id from public.listings where reference_number = 'SELL-RENEW-MINE'));
reset role; reset test.uid;

select case when updated_at > now() - interval '1 minute' then 'PASS' else 'FAIL' end
  as "T2 renewing moves updated_at to now"
from public.listings where reference_number = 'SELL-RENEW-MINE';

-- Renewing says "still current", not "changed": everything else stays put, or
-- the browse list would reorder and the reference number could move.
select case when status = 'available' and commodity = 'Renewal Copper'
             and created_at < now() - interval '40 days'
            then 'PASS' else 'FAIL' end
  as "T3 renewing changes nothing else about the listing"
from public.listings where reference_number = 'SELL-RENEW-MINE';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 the renewal is in the activity log"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'listing_renewed' and p.email = 'renewer@example.invalid';

\echo
\echo '=========== ONLY THE OWNER MAY RENEW ==========='

set role authenticated; set test.uid='e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
savepoint before_foreign_renewal;
select public.renew_listing((select id from public.listings where reference_number = 'SELL-RENEW-MINE'));
rollback to savepoint before_foreign_renewal;
reset role; reset test.uid;

select case when updated_at < now() - interval '30 days' then 'PASS' else 'FAIL' end
  as "T5 another participant cannot renew a listing that is not theirs"
from public.listings where reference_number = 'SELL-RENEW-THEIRS';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 the refused renewal left no log entry"
from public.activity_log where action = 'listing_renewed';

\echo
\echo '=========== updated_at IS NOT THE CLIENT TO WRITE ==========='

-- The column that decides staleness has to be the database's, or renewing is
-- something a participant can simply claim.
set role authenticated; set test.uid='e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
update public.listings set updated_at = now() + interval '365 days'
 where reference_number = 'SELL-RENEW-THEIRS';
reset role; reset test.uid;

select case when updated_at < now() + interval '1 minute' then 'PASS' else 'FAIL' end
  as "T7 a participant cannot backdate or forward-date updated_at"
from public.listings where reference_number = 'SELL-RENEW-THEIRS';

\echo
\echo '=========== CLOSING IS STILL ALLOWED, ARCHIVING IS NOT ==========='

set role authenticated; set test.uid='e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
update public.listings set status = 'closed' where reference_number = 'SELL-RENEW-THEIRS';
reset role; reset test.uid;

select case when status = 'closed' then 'PASS' else 'FAIL got ' || status end
  as "T8 the owner can answer 'no' by closing the listing"
from public.listings where reference_number = 'SELL-RENEW-THEIRS';

-- Archiving stays an Operator action, exactly as before this feature existed.
set role authenticated; set test.uid='e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
savepoint before_archive;
update public.listings set status = 'archived' where reference_number = 'SELL-RENEW-THEIRS';
rollback to savepoint before_archive;
reset role; reset test.uid;

select case when status = 'closed' then 'PASS' else 'FAIL got ' || status end
  as "T9 a participant still cannot archive a listing"
from public.listings where reference_number = 'SELL-RENEW-THEIRS';

\echo
\echo '=========== THE RENEWAL SHOWS UP IN THE EXPORT ==========='

set role authenticated; set test.uid='e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 a renewal is part of the participant's own activity export"
from public.my_activity_export()
where category = 'listing_renewed' and reference = 'SELL-RENEW-MINE';

reset role; reset test.uid;

set role authenticated; set test.uid='e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';

select case when count(*) = 0 then 'PASS' else 'FAIL leaked ' || count(*) end
  as "T11 and not of anybody else's"
from public.my_activity_export() where category = 'listing_renewed';

reset role; reset test.uid;
