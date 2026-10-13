-- 17_browse_requires_approval.sql
--
-- Proves sql/025: a member who is not approved cannot browse the market.
--
-- WHY THIS EXISTS
--
-- Browse does not read the listings table. Row Level Security there gives a
-- member only their own rows, so Browse calls get_public_listings(), which is
-- SECURITY DEFINER and runs with the owner's rights - that is how a member
-- sees other people's offers without seeing who posted them.
--
-- It asked who was calling and never whether they were still allowed in.
--
-- Proven against the LIVE project on 2026-10-13, with a throwaway account
-- created and deleted inside the same check:
--
--   APPROVED  -> listings visible: 1
--   (operator suspends the account)
--   SUSPENDED -> listings visible: 1      <- the hole
--   SUSPENDED -> posting a listing: 403   <- correctly refused
--
-- Writing was shut; reading was not. An access token lives about an hour and
-- the browser keeps it, so a member suspended at nine could carry on reading
-- the whole market from a tab already open. The interface sends them to the
-- sign-in page, but the interface is not the lock.
--
-- The important assertions below are the prohibitions. A test that only proved
-- an approved member can still browse would have passed before the fix.

\set QUIET on
\pset pager off

\echo
\echo '=========== BROWSE NEEDS AN ACTIVE ACCOUNT ==========='

-- Two accounts to switch between: one that stays approved, one that gets
-- suspended mid-test, which is exactly what an Operator does.
insert into auth.users (id, email, raw_user_meta_data)
values ('b0b0b0b0-0000-4000-8000-00000000001a'::uuid, 'browse-good@example.invalid',
        jsonb_build_object('first_name', 'Still', 'last_name', 'Welcome'))
on conflict do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values ('b0b0b0b0-0000-4000-8000-00000000001b'::uuid, 'browse-out@example.invalid',
        jsonb_build_object('first_name', 'Shown', 'last_name', 'Out'))
on conflict do nothing;

update public.profiles set status = 'approved'
 where user_id in ('b0b0b0b0-0000-4000-8000-00000000001a'::uuid,
                   'b0b0b0b0-0000-4000-8000-00000000001b'::uuid);

-- Something to look at, so "nothing visible" cannot pass for the wrong reason.
insert into public.listings
  (user_id, type, commodity, incoterm, origin, reference_number, quantity, unit, status)
select p.id, 'sell', 'Browse Test Copper', 'FOB', 'Chile', 'SELL-BROWSE-001', 5000, 'Metric tons', 'available'
  from public.profiles p where p.user_id = 'b0b0b0b0-0000-4000-8000-00000000001a'::uuid
on conflict do nothing;

-- Results are recorded in a temp table and asserted by a labelled select,
-- which is the convention the rest of sql/tests uses: the report reads those
-- labels, and a raise notice is invisible to it.
create temp table t17_result (name text, ok boolean);

-- ------------------------------------------- an approved member can browse --

set local "test.uid" = 'b0b0b0b0-0000-4000-8000-00000000001b';

select case when (select count(*) from public.get_public_listings()) > 0
            then 'PASS' else 'FAIL' end
  as "T1 Item59 an approved member sees the market";

-- --------------------------------------------- the Operator suspends them --

update public.profiles set status = 'suspended'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

do $$
begin
  perform 1 from public.get_public_listings() limit 1;
  insert into t17_result values ('T2', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T2', true);
  when others then insert into t17_result values ('T2', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end as "T2 Item59 a SUSPENDED member is refused the whole market"
  from t17_result where name = 'T2';


-- ------------------------------------------- and the same for pending, and --
-- ------------------------------------------- for rejected, which are the two --
-- ------------------------------------------- other ways to not be a member --

update public.profiles set status = 'pending'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

do $$
begin
  perform 1 from public.get_public_listings() limit 1;
  insert into t17_result values ('T3', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T3', true);
  when others then insert into t17_result values ('T3', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end as "T3 Item59 a PENDING registration cannot read the market"
  from t17_result where name = 'T3';


update public.profiles set status = 'rejected'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

do $$
begin
  perform 1 from public.get_public_listings() limit 1;
  insert into t17_result values ('T4', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T4', true);
  when others then insert into t17_result values ('T4', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end as "T4 Item59 a REJECTED registration cannot read the market"
  from t17_result where name = 'T4';


-- ------------------------------------------------- nobody at all is refused --
--
-- A caller with no profile - a token for an account that has been deleted, or
-- no token at all.

set local "test.uid" = '';

do $$
begin
  perform 1 from public.get_public_listings() limit 1;
  insert into t17_result values ('T5', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T5', true);
  when others then insert into t17_result values ('T5', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end as "T5 Item59 a caller with no account is refused the market"
  from t17_result where name = 'T5';


-- ---------------------------------------- the approved member is untouched --
--
-- The fix must not have shut the door on everybody. This is the control.

set local "test.uid" = 'b0b0b0b0-0000-4000-8000-00000000001a';

select case when (select count(*) from public.get_public_listings()) > 0
            then 'PASS' else 'FAIL' end
  as "T6 Item59 an approved member can still browse after all of the above";

-- =========================================================================
-- The same question asked of the other definer functions (sql/026).
--
-- These were found in the same sweep: functions that run with the owner's
-- rights, so RLS does not stand behind them, and which asked who was calling
-- without asking whether they were still allowed in.
-- =========================================================================

set local "test.uid" = 'b0b0b0b0-0000-4000-8000-00000000001b';
update public.profiles set status = 'suspended'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

-- A listing of their own to try to renew, created while they were still in.
insert into public.listings
  (user_id, type, commodity, incoterm, origin, reference_number, quantity, unit, status)
select p.id, 'sell', 'Suspended Member Copper', 'FOB', 'Peru', 'SELL-SUSPENDED-001', 100, 'Metric tons', 'available'
  from public.profiles p where p.user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid
on conflict do nothing;

do $$
declare v_id uuid;
begin
  select l.id into v_id from public.listings l
    join public.profiles p on p.id = l.user_id
   where p.user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid
   limit 1;
  perform public.renew_listing(v_id);
  insert into t17_result values ('T7', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T7', true);
  when others then insert into t17_result values ('T7', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end
  as "T7 Item59 a suspended member cannot keep their own listing looking fresh"
  from t17_result where name = 'T7';

do $$
begin
  perform public.next_reference('sell');
  insert into t17_result values ('T8', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T8', true);
  when others then insert into t17_result values ('T8', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end
  as "T8 Item59 a suspended member cannot draw a reference number"
  from t17_result where name = 'T8';

-- A SUSPENDED OPERATOR is the one that matters most: the audit trail is what
-- you read to find out what somebody did before you suspended them.

update public.profiles set role = 'operator', status = 'suspended'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

do $$
begin
  perform public.purge_orphaned_activity();
  insert into t17_result values ('T9', false);
exception
  when sqlstate '42501' then insert into t17_result values ('T9', true);
  when others then insert into t17_result values ('T9', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end
  as "T9 Item59 a suspended Operator cannot delete audit rows"
  from t17_result where name = 'T9';

-- Control: an approved Operator still can, so the fix did not simply break it.

update public.profiles set status = 'approved'
 where user_id = 'b0b0b0b0-0000-4000-8000-00000000001b'::uuid;

do $$
begin
  perform public.purge_orphaned_activity();
  insert into t17_result values ('T10', true);
exception
  when others then insert into t17_result values ('T10', false);
end $$;

select case when ok then 'PASS' else 'FAIL' end
  as "T10 Item59 an approved Operator can still purge"
  from t17_result where name = 'T10';
