-- 18_activity_log_write_only.sql
--
-- Proves sql/030: the activity log can only be written through
-- record_activity(), and record_activity() only writes what it is willing to.
--
-- WHY THIS EXISTS
--
-- The log's whole value is being the version of events nobody can argue with.
-- Before 030, `authenticated` held a direct INSERT grant on the table and a
-- policy that pinned WHO a participant could write as, but said nothing about
-- WHAT. A member could add a line reading 'operator agreed to waive
-- documents', in their own name, in the Operator's audit trail. They could
-- never erase or alter a line - only add - which is why this was a pollution
-- hole and not a tampering one.
--
-- The assertions that matter here are the prohibitions. T2, T4 and T5 are the
-- file's reason for existing; a test that only proved logging still works
-- would have passed before the fix as well as after it.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE ACTIVITY LOG HAS ONE DOOR ==========='

-- One member and one operator. test_invite() first: sql/024 made
-- handle_new_user() refuse a signup with no invitation, and an insert into
-- auth.users IS the signup.
select public.test_invite('logbook-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('10980000-0000-4000-8000-00000000001a'::uuid, 'logbook-member@example.invalid',
        jsonb_build_object('first_name', 'Lea', 'last_name', 'Member'))
on conflict do nothing;

select public.test_invite('logbook-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('10980000-0000-4000-8000-00000000001b'::uuid, 'logbook-op@example.invalid',
        jsonb_build_object('first_name', 'Olu', 'last_name', 'Operator'))
on conflict do nothing;

-- Proof both accounts exist before anything is asserted about them. Without
-- it, a refused signup leaves the whole file testing nothing and saying PASS.
select case when count(*) = 2 then 'PASS' else 'FAIL only ' || count(*) end
  as "T0 Item30 both test accounts were actually created"
from public.profiles
where user_id in ('10980000-0000-4000-8000-00000000001a'::uuid,
                  '10980000-0000-4000-8000-00000000001b'::uuid);

-- Changed with NO identity set: protect_profile_columns() silently reverts a
-- role or status change made by a non-operator caller rather than raising, so
-- doing this while pretending to be the member would quietly do nothing.
update public.profiles set status = 'approved'
 where user_id = '10980000-0000-4000-8000-00000000001a'::uuid;
update public.profiles set role = 'operator', status = 'approved'
 where user_id = '10980000-0000-4000-8000-00000000001b'::uuid;

create temp table t18_result (name text, ok boolean, note text);
-- T2 switches to the `authenticated` role to test a grant, and an exception
-- handler that cannot write its own result reports nothing at all: the first
-- run lost T2 entirely to "permission denied for table t18_result", which the
-- report reads as a missing assertion rather than a failure.
grant all on t18_result to authenticated;


-- ------------------------------------------- the front door still works ----

set "test.uid" = '10980000-0000-4000-8000-00000000001a';
select public.record_activity('login');

select case when count(*) = 1 then 'PASS' else 'FAIL wrote ' || count(*) end
  as "T1 Item30 an approved member can record a login"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where p.user_id = '10980000-0000-4000-8000-00000000001a'::uuid
  and a.action = 'login';


-- --------------------------------------- the actor cannot be supplied -----
--
-- record_activity() takes no user_id at all, so there is no parameter to lie
-- in. This asserts the consequence: the row carries the CALLER's profile, and
-- the operator's profile has had nothing written against it.

-- Narrowed to the action under test on purpose. The first version asserted
-- the operator's profile had NO log rows at all and failed: handle_new_user()
-- logs a line at signup, so the profile was never empty. The suite shares one
-- database between files, so an assertion that assumes a blank slate is
-- testing the fixture, not the function.
select case when not exists (
    select 1 from public.activity_log a
    join public.profiles p on p.id = a.user_id
    where p.user_id = '10980000-0000-4000-8000-00000000001b'::uuid
      and a.action = 'login'
  ) then 'PASS' else 'FAIL — the member''s login was filed against the operator' end
  as "T1a Item30 the line is filed against the caller, not anyone else";


-- ------------------------------------ the direct route is gone (the point) --

set role authenticated;
do $$
begin
  insert into public.activity_log (user_id, action, details)
  select p.id, 'operator agreed to waive documents', null
    from public.profiles p
   where p.user_id = '10980000-0000-4000-8000-00000000001a'::uuid;
  insert into t18_result values ('T2', false, 'the insert was accepted');
exception
  when insufficient_privilege then insert into t18_result values ('T2', true, null);
  when others then insert into t18_result values ('T2', true, sqlstate);
end $$;
reset role;

select case when ok then 'PASS' else 'FAIL — ' || coalesce(note, '') end
  as "T2 Item30 a member CANNOT write a line into the log by hand"
  from t18_result where name = 'T2';

-- And nothing of the sort landed, which is the claim a reader actually cares
-- about - a refused statement that still wrote a row would pass T2.
select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) || ' forged lines' end
  as "T2a Item30 and no forged line exists in the log"
from public.activity_log
where action = 'operator agreed to waive documents';


-- ---------------------------------- the front door refuses invented lines --

set "test.uid" = '10980000-0000-4000-8000-00000000001a';
do $$
begin
  perform public.record_activity('operator agreed to waive documents');
  insert into t18_result values ('T3', false, 'accepted');
exception
  when sqlstate '22023' then insert into t18_result values ('T3', true, null);
  when others then insert into t18_result values ('T3', false, sqlstate);
end $$;

select case when ok then 'PASS' else 'FAIL — ' || coalesce(note, '') end
  as "T3 Item30 record_activity refuses an action the platform does not record"
  from t18_result where name = 'T3';


-- -------------------------- a member cannot claim an Operator's action ----

do $$
begin
  perform public.record_activity('invitation_deleted', '{"email":"rival@example.invalid"}'::jsonb);
  insert into t18_result values ('T4', false, 'accepted');
exception
  when sqlstate '22023' then insert into t18_result values ('T4', true, null);
  when others then insert into t18_result values ('T4', false, sqlstate);
end $$;

select case when ok then 'PASS' else 'FAIL — ' || coalesce(note, '') end
  as "T4 Item30 a member CANNOT record an Operator-only action"
  from t18_result where name = 'T4';


-- ------------------------------ a suspended member STILL gets logged, and --
-- ------------------------------ that is on purpose: see the note in 030 ----

reset "test.uid";
update public.profiles set status = 'suspended'
 where user_id = '10980000-0000-4000-8000-00000000001a'::uuid;
set "test.uid" = '10980000-0000-4000-8000-00000000001a';

select public.record_activity('login');

select case when count(*) = 2 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 Item30 a SUSPENDED member's sign-in is still recorded"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where p.user_id = '10980000-0000-4000-8000-00000000001a'::uuid
  and a.action = 'login';

-- But they are no freer than before with what they may write.
do $$
begin
  perform public.record_activity('commodity_removed', '{"name":"Copper"}'::jsonb);
  insert into t18_result values ('T5a', false, 'accepted');
exception
  when sqlstate '22023' then insert into t18_result values ('T5a', true, null);
  when others then insert into t18_result values ('T5a', false, sqlstate);
end $$;

select case when ok then 'PASS' else 'FAIL — ' || coalesce(note, '') end
  as "T5a Item30 a suspended member still CANNOT write an Operator action"
  from t18_result where name = 'T5a';

-- A token whose profile was deleted outright has nothing to file a line
-- against, and must be refused rather than writing an actor-less row - the
-- orphan shape sql/tests/14 exists to clean up.
reset "test.uid";
set "test.uid" = 'dddddddd-0000-4000-8000-0000000000ff';
do $$
begin
  perform public.record_activity('login');
  insert into t18_result values ('T5b', false, 'accepted');
exception
  when sqlstate '42501' then insert into t18_result values ('T5b', true, null);
  when others then insert into t18_result values ('T5b', false, sqlstate);
end $$;

select case when ok then 'PASS' else 'FAIL — ' || coalesce(note, '') end
  as "T5b Item30 a token with no profile at all is refused"
  from t18_result where name = 'T5b';


-- --------------------------------- the Operator's own actions still log ----

reset "test.uid";
set "test.uid" = '10980000-0000-4000-8000-00000000001b';
select public.record_activity('invitation_created', '{"email":"guest@example.invalid"}'::jsonb);

select case when count(*) = 1 then 'PASS' else 'FAIL wrote ' || count(*) end
  as "T6 Item30 an Operator can record an Operator action"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where p.user_id = '10980000-0000-4000-8000-00000000001b'::uuid
  and a.action = 'invitation_created';

-- A signed-out visitor holds the anon role, which record_activity() is not
-- granted to. Asserted off the catalogue, which is the same thing the grant
-- controls: the anon role exists here (sql/tests/00_supabase_stub.sql:24) but
-- carries no JWT to make auth.uid() resolve, so calling it would be refused
-- for the wrong reason and prove nothing about the grant.
select case when not has_function_privilege('anon', 'public.record_activity(text, jsonb)', 'execute')
            then 'PASS' else 'FAIL — anon can execute it' end
  as "T7 Item30 a signed-out visitor has no route to the log";

reset "test.uid";
reset role;
