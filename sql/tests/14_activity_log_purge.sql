-- 14_activity_log_purge.sql
--
-- Proves sql/021: purge_orphaned_activity() removes traces of things that no
-- longer exist, and nothing else.
--
-- The owner asked for a button to erase the activity log. He did not get one,
-- because that log is the evidence that an introduction happened and section 8
-- of the Terms claims a commission for 24 months after one. What he got is a
-- purge with a narrow rule, and the value of a narrow rule is entirely in what
-- it REFUSES to delete - so most of this file is about survivors.
--
-- Four kinds of row are set up on purpose:
--
--   1. an orphan naming a listing that is gone        -> must be removed
--   2. an orphan naming a profile that is gone        -> must be removed
--   3. an actor-less row naming a LIVE listing        -> must survive
--   4. an ordinary row with a real actor              -> must survive
--
-- Row 3 is not inserted by hand. Creating the fixture listing writes it, with
-- a null actor, because no identity is set for that insert - the real trigger
-- producing the real shape.
--
-- Row 3 is the one that matters. A null user_id is normal for anything written
-- over a direct connection, so "no actor" alone can never be grounds to delete.

\set QUIET on
\pset pager off

\echo
\echo '=============== THE ACTIVITY LOG PURGE REMOVES ONLY ORPHANS ==============='

select public.test_invite('purge-operator@example.invalid');
select public.test_invite('purge-member@example.invalid');
select public.test_invite('purge-operator@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values
('a0a0a0a0-0000-4000-8000-00000000000a'::uuid,
  'purge-operator@example.invalid',
  jsonb_build_object('first_name', 'Olive', 'last_name', 'Keeper',
                     'phone', '+3200000071', 'country', 'Belgium', 'language', 'en'));
select public.test_invite('purge-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values
('a0a0a0a0-0000-4000-8000-00000000000b'::uuid,
  'purge-member@example.invalid',
  jsonb_build_object('first_name', 'Mina', 'last_name', 'Poster',
                     'phone', '+3200000072', 'country', 'Belgium', 'language', 'en'));

update public.profiles set role = 'operator', status = 'approved'
 where email = 'purge-operator@example.invalid';
update public.profiles set status = 'approved'
 where email = 'purge-member@example.invalid';

-- A real listing, which stays alive for the whole test.
insert into public.listings (user_id, reference_number, type, commodity, quantity, unit, incoterm, origin, status)
values ((select id from public.profiles where email = 'purge-member@example.invalid'),
        'SELL-PURGE-LIVE', 'sell', 'Wheat', 1000, 'MT', 'FOB', 'belgium', 'available');

-- Earlier files in this suite create and delete their own fixtures, so the log
-- already holds orphans of theirs. Clear those FIRST: every count below is
-- about the four rows this file makes, and an absolute count means nothing
-- while somebody else's residue is still in the table.
set test.uid = 'a0a0a0a0-0000-4000-8000-00000000000a';
select public.purge_orphaned_activity();
reset test.uid;

delete from public.activity_log where action = 'activity_log_purged';

-- Row 3 needs no insert: creating the listing above already wrote one.
-- trg_log_listing_change records public.current_profile_id(), which is null
-- here because no identity was set for that insert - so the trigger produced,
-- by itself, exactly the actor-less row naming a LIVE listing that this test
-- exists to protect. Using the real row rather than a hand-made copy is the
-- stronger test: it is the shape the live database actually contains.

-- Row 1: no actor, names a listing id that does not exist.
insert into public.activity_log (user_id, action, details)
values (null, 'listing_removed',
        jsonb_build_object('listing_id', 'dead0000-0000-4000-8000-00000000dead'::uuid));

-- Row 2: no actor, names a profile id that does not exist.
insert into public.activity_log (user_id, action, details)
values (null, 'user_status_changed',
        jsonb_build_object('profile_id', 'dead0000-0000-4000-8000-00000000beef'::uuid,
                           'email', 'vanished@example.invalid'));

-- Row 4: an ordinary row with a real actor.
insert into public.activity_log (user_id, action)
values ((select id from public.profiles where email = 'purge-member@example.invalid'), 'login');

select case when count(*) = 4 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 the fixture really does hold all four kinds of row"
from public.activity_log
where details->>'listing_id' in
        ('dead0000-0000-4000-8000-00000000dead',
         (select id::text from public.listings where reference_number = 'SELL-PURGE-LIVE'))
   or details->>'profile_id' = 'dead0000-0000-4000-8000-00000000beef'
   or (action = 'login'
       and user_id = (select id from public.profiles where email = 'purge-member@example.invalid'));

-- --------------------------------------------------- only an Operator may --

set test.uid = 'a0a0a0a0-0000-4000-8000-00000000000b';

-- No savepoint: a plpgsql EXCEPTION block is itself a subtransaction, so the
-- function's partial work is rolled back when the refusal is caught.
do $$
begin
  perform public.purge_orphaned_activity();
  raise exception 'NOTREFUSED';
exception
  when sqlstate '42501' then null;   -- 'Operators only': what we want
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'a participant was allowed to purge the activity log';
    end if;
    raise;
end $$;

select case when count(*) = 4 then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 Item52 a member cannot purge the activity log; all four rows remain"
from public.activity_log
where details->>'listing_id' in
        ('dead0000-0000-4000-8000-00000000dead',
         (select id::text from public.listings where reference_number = 'SELL-PURGE-LIVE'))
   or details->>'profile_id' = 'dead0000-0000-4000-8000-00000000beef'
   or (action = 'login'
       and user_id = (select id from public.profiles where email = 'purge-member@example.invalid'));

-- ------------------------------------------------------------- the purge --

set test.uid = 'a0a0a0a0-0000-4000-8000-00000000000a';

-- Called once and held: the function both deletes and logs, so evaluating it
-- twice in one expression would make the second call assert against a database
-- the first call had already changed.
create temporary table purge_result as select public.purge_orphaned_activity() as removed;

select case when removed = 2 then 'PASS' else 'FAIL removed ' || removed end
  as "T3 the purge removes exactly the two orphans" from purge_result;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 the orphan naming a deleted listing is gone"
from public.activity_log
where details->>'listing_id' = 'dead0000-0000-4000-8000-00000000dead';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 the orphan naming a deleted profile is gone"
from public.activity_log
where details->>'profile_id' = 'dead0000-0000-4000-8000-00000000beef';

-- -------------------------------------------------------------- survivors --

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T6 an actor-less row naming a LIVE listing survives"
from public.activity_log a
where a.user_id is null
  and a.details->>'listing_id' =
      (select id::text from public.listings where reference_number = 'SELL-PURGE-LIVE');

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T7 an ordinary row with a real actor survives"
from public.activity_log
where action = 'login'
  and user_id = (select id from public.profiles where email = 'purge-member@example.invalid');

-- --------------------------------------------------- the purge is recorded --

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 the purge records itself, with the number it removed"
from public.activity_log
where action = 'activity_log_purged'
  and (details->>'rows_removed')::int = 2
  and user_id = (select id from public.profiles where email = 'purge-operator@example.invalid');

-- Its own row has an actor and names nothing vanished, so a second purge
-- cannot remove the evidence that the first one happened.
select case when public.purge_orphaned_activity() = 0 then 'PASS' else 'FAIL' end
  as "T9 a second purge finds nothing left to remove";

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 the record of the first purge survived the second"
from public.activity_log
where action = 'activity_log_purged' and (details->>'rows_removed')::int = 2;

reset test.uid;

-- ============ THE SAME RULE, ACROSS THE OTHER TWO FEED TABLES ============
--
-- sql/023. The activity log was cleaned and the other feeds were not, and the
-- full stress run found 4,770 orphaned notifications on the live project -
-- every one addressed to the owner's own Operator account, because
-- notifications cascade from the profile they are ADDRESSED TO and not the
-- thing they are ABOUT. Same shape, different table, found a day later.

\echo
\echo '=========== THE PURGE COVERS THE OPERATOR FEED AND THE OUTBOX ==========='

-- The identity was reset above. Without it current_profile_id() is null and
-- the purge refuses - correctly, and the first version of this section did
-- exactly that, then measured the refusal as a result of zero.
set test.uid = 'a0a0a0a0-0000-4000-8000-00000000000a';

-- Addressed to a LIVE operator, about a listing that is gone: the exact row
-- that survived every teardown.
insert into public.notifications (user_id, type, message, related_id)
values ((select id from public.profiles where email = 'purge-operator@example.invalid'),
        'new_listing', 'A listing that no longer exists',
        'dead0000-0000-4000-8000-0000000000aa'::uuid);

-- Addressed to the same live operator, about a listing that is still there.
-- This one must survive, and it is the whole point of the rule.
insert into public.notifications (user_id, type, message, related_id)
values ((select id from public.profiles where email = 'purge-operator@example.invalid'),
        'new_listing', 'A listing that is still here',
        (select id from public.listings where reference_number = 'SELL-PURGE-LIVE'));

-- No target at all: points at nothing by design, not by deletion.
insert into public.notifications (user_id, type, message, related_id)
values ((select id from public.profiles where email = 'purge-operator@example.invalid'),
        'system', 'Nothing in particular', null);

-- Queued mail about a listing that is gone cannot be created at all: a
-- foreign key on related_listing_id refuses it. That is why the purge has no
-- email_outbox branch, and proving the refusal is worth more than proving a
-- delete that could never run.
do $$
begin
  insert into public.email_outbox (to_email, subject, body_text, related_listing_id)
  values ('nobody@example.invalid', 'About a vanished listing', 'body',
          'dead0000-0000-4000-8000-0000000000bb'::uuid);
  raise exception 'NOTREFUSED';
exception
  when foreign_key_violation then null;   -- what we want
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'the outbox accepted mail about a listing that does not exist';
    end if;
    raise;
end $$;

-- Queued mail about a listing that is still there: must survive.
--
-- Addressed to a REAL-looking address on purpose. It used to say
-- somebody@example.invalid, and sql/027 - which clears unsent mail to
-- addresses that can never receive any - correctly removed it, breaking this
-- assertion and the count in T11. The app was right and the fixture was
-- wrong: an undeliverable address is not what "mail about a live listing"
-- means. The case it accidentally covered now has an assertion of its own
-- below (T22), rather than being lost.
insert into public.email_outbox (to_email, subject, body_text, related_listing_id)
values ('live.listing.watcher@telenet.be', 'About a live listing', 'body',
        (select id from public.listings where reference_number = 'SELL-PURGE-LIVE'));

create temporary table purge2 as select public.purge_orphaned_activity() as removed;

select case when removed = 1 then 'PASS' else 'FAIL removed ' || removed end
  as "T11 the purge removes the orphaned notification"
from purge2;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 the notification about a vanished listing is gone"
from public.notifications where related_id = 'dead0000-0000-4000-8000-0000000000aa';

-- Counted as "at least the one added here", not "exactly one": creating the
-- fixture listing already fired trg_notify_new_listing for every operator, so
-- rows about it existed before this section began. An absolute count here is
-- the same mistake this file's first version made twice.
select case when count(*) >= 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T13 the notification about a LIVE listing survives"
from public.notifications
where related_id = (select id from public.listings where reference_number = 'SELL-PURGE-LIVE')
  and message = 'A listing that is still here';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T14 a notification with no target at all survives"
from public.notifications where related_id is null and type = 'system';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T15 the outbox holds no mail about a listing that does not exist"
from public.email_outbox where related_listing_id = 'dead0000-0000-4000-8000-0000000000bb';

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T16 queued mail about a LIVE listing survives"
from public.email_outbox
where related_listing_id = (select id from public.listings where reference_number = 'SELL-PURGE-LIVE')
  and subject = 'About a live listing';

-- The receipt now says which table each removal came from, so a future reader
-- can tell a feed problem from an audit-trail problem without guessing.
select case when (details->>'notifications')::int = 1
            then 'PASS' else 'FAIL ' || details::text end
  as "T17 the receipt breaks the count down by table"
from public.activity_log
where action = 'activity_log_purged'
order by created_at desc limit 1;


-- ===================================================================
-- sql/027: the purge also clears mail that was never going anywhere.
--
-- Harmless only while no mail is sent at all. The day the keys are set the
-- queue flushes and whatever is in it goes - which on 2026-10-13 included a
-- seven-week-old notice about a test listing.
-- ===================================================================

insert into public.email_outbox (to_email, subject, body_text)
values ('jericho-e2e-someone@example.invalid', 'Test run leftover', 'body'),
       ('somebody@example.com',                'Reserved domain',   'body'),
       ('a.real.member@telenet.be',            'A real notice',     'body');

-- One real address with mail that FAILED and is old: the tempting case, and
-- the one that must survive. A member's failed notification is something to
-- look at, not something to make disappear.
insert into public.email_outbox (to_email, subject, body_text, attempts, created_at)
values ('another.real@telenet.be', 'An old failure', 'body', 3, now() - interval '40 days');

-- And one already sent to a test address: a record of something that
-- happened, which the purge must not rewrite.
insert into public.email_outbox (to_email, subject, body_text, sent_at)
values ('jericho-e2e-sent@example.invalid', 'Already sent', 'body', now());

select public.purge_orphaned_activity();

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T18 unsent mail to a test address is gone"
from public.email_outbox
where sent_at is null
  and (to_email like 'jericho-e2e-%' or to_email like '%@example.com');

-- Named exactly, not matched by domain: a domain match counts whatever else
-- the file happens to have queued, so the assertion moves whenever an
-- unrelated fixture changes. It already did once.
select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T19 unsent mail to a REAL address survives, however old or failed"
from public.email_outbox
where sent_at is null
  and to_email in ('a.real.member@telenet.be', 'another.real@telenet.be');

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T20 mail already sent is left alone, test address or not"
from public.email_outbox where subject = 'Already sent';

select case when (details->>'test_mail')::int = 2
            then 'PASS' else 'FAIL ' || details::text end
  as "T21 the receipt counts the mail it removed"
from public.activity_log
where action = 'activity_log_purged'
order by created_at desc limit 1;

-- An undeliverable address is cleared even when the listing it is about is
-- perfectly alive. Liveness of the listing is not the question; whether the
-- mail could ever arrive is.
insert into public.email_outbox (to_email, subject, body_text, related_listing_id)
values ('nobody@example.invalid', 'Live listing, dead address', 'body',
        (select id from public.listings where reference_number = 'SELL-PURGE-LIVE'));

select public.purge_orphaned_activity();

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T22 an undeliverable address is cleared even about a live listing"
from public.email_outbox where subject = 'Live listing, dead address';
-- This assertion carried a stray copy of T21's last three lines from
-- 2026-10-13 until 2026-10-25 - a second FROM clause - so it errored, produced
-- no row, and never ran once while every run reported green. Found when
-- scripts/run-sql-tests.js learned to compare declared assertions against
-- reported ones.

reset test.uid;