-- 16_invitation_required.sql
--
-- Proves sql/024: an account cannot be created without an invitation.
--
-- The hole this closes was open on the live project and invisible to every
-- suite, because every test walked the invited path. Nothing had ever tried
-- the path nobody intended - a bare signup, with no invitation anywhere.
--
-- So the first assertion here is the one that matters, and it is a
-- prohibition: the uninvited signup must FAIL. A test that only proves the
-- invited path still works would have passed before this change too, and
-- proved nothing.
--
-- Note on the shape of these tests: inserting into auth.users is what fires
-- handle_new_user(), so that insert IS the signup. A refusal arrives as an
-- exception, which a plpgsql block turns into a PASS.

\set QUIET on
\pset pager off

\echo
\echo '=========== AN ACCOUNT NEEDS AN INVITATION ==========='

-- ------------------------------------------------- the bootstrap exemption --
--
-- This file runs against a database that earlier files have already populated,
-- so profiles is NOT empty and the exemption is already closed. That is the
-- state worth testing: it is the state the live project is in.

select case when exists (select 1 from public.profiles) then 'PASS' else 'FAIL' end
  as "T1 the database already has profiles, so the bootstrap exemption is shut";

-- --------------------------------------------- an uninvited signup is refused --

savepoint before_uninvited;
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('c0c0c0c0-0000-4000-8000-00000000000a'::uuid,
          'gatecrasher@example.invalid',
          jsonb_build_object('first_name', 'Gate', 'last_name', 'Crasher'));
  raise exception 'NOTREFUSED';
exception
  when sqlstate '42501' then null;   -- 'Registration is by invitation only.'
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'an uninvited signup created an account';
    end if;
    raise;
end $$;
rollback to savepoint before_uninvited;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 Item56 an uninvited signup leaves no profile behind"
from public.profiles where email = 'gatecrasher@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 Item56 and no auth user either"
from auth.users where email = 'gatecrasher@example.invalid';

-- --------------------------------------------------- an invited one is let in --

-- An operator to do the inviting. Any existing profile will do as the author;
-- this is about the invitation, not about who wrote it.
insert into public.invitations (token, email, created_by, expires_at)
values ('inv-token-welcome-0001', 'welcome@example.invalid',
        (select id from public.profiles order by created_at limit 1),
        now() + interval '2 days');

insert into auth.users (id, email, raw_user_meta_data)
values ('c0c0c0c0-0000-4000-8000-00000000000b'::uuid,
        'welcome@example.invalid',
        jsonb_build_object('first_name', 'Wel', 'last_name', 'Come'));

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T4 Item56 an invited address can register"
from public.profiles where email = 'welcome@example.invalid';

select case when status = 'pending' and role = 'participant' then 'PASS'
            else 'FAIL ' || role || '/' || status end
  as "T5 Item56 and still lands as a pending participant, not approved"
from public.profiles where email = 'welcome@example.invalid';

-- ------------------------------------------- the invitation is consumed once --

select case when used_at is not null then 'PASS' else 'FAIL still unused' end
  as "T6 Item56 the invitation is marked used by the registration itself"
from public.invitations where token = 'inv-token-welcome-0001';

select case when used_by = (select id from public.profiles where email = 'welcome@example.invalid')
            then 'PASS' else 'FAIL wrong or missing used_by' end
  as "T7 Item56 and records which account used it"
from public.invitations where token = 'inv-token-welcome-0001';

-- The same address again, with the invitation now spent. This is the case an
-- attacker would try: one leaked invitation, many accounts.
savepoint before_reuse;
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('c0c0c0c0-0000-4000-8000-00000000000c'::uuid,
          'welcome@example.invalid',
          jsonb_build_object('first_name', 'Second', 'last_name', 'Helping'));
  raise exception 'NOTREFUSED';
exception
  when sqlstate '42501' then null;
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'a spent invitation was used a second time';
    end if;
    raise;
end $$;
rollback to savepoint before_reuse;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 Item56 a spent invitation cannot make a second account"
from public.profiles where email = 'welcome@example.invalid';

-- -------------------------------------------------- an expired one is refused --

insert into public.invitations (token, email, created_by, expires_at)
values ('inv-token-stale-0002', 'toolate@example.invalid',
        (select id from public.profiles order by created_at limit 1),
        now() - interval '1 day');

savepoint before_expired;
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('c0c0c0c0-0000-4000-8000-00000000000d'::uuid,
          'toolate@example.invalid',
          jsonb_build_object('first_name', 'Too', 'last_name', 'Late'));
  raise exception 'NOTREFUSED';
exception
  when sqlstate '42501' then null;
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'an expired invitation was accepted';
    end if;
    raise;
end $$;
rollback to savepoint before_expired;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T9 Item56 an expired invitation is refused"
from public.profiles where email = 'toolate@example.invalid';

-- ------------------------------- somebody else's invitation is not yours --

insert into public.invitations (token, email, created_by, expires_at)
values ('inv-token-forsomeone-0003', 'invited.person@example.invalid',
        (select id from public.profiles order by created_at limit 1),
        now() + interval '2 days');

savepoint before_wrong_address;
do $$
begin
  -- A live, unexpired invitation exists - for somebody else. Registering a
  -- DIFFERENT address must not borrow it.
  insert into auth.users (id, email, raw_user_meta_data)
  values ('c0c0c0c0-0000-4000-8000-00000000000e'::uuid,
          'someone.else@example.invalid',
          jsonb_build_object('first_name', 'Some', 'last_name', 'Else'));
  raise exception 'NOTREFUSED';
exception
  when sqlstate '42501' then null;
  when others then
    if sqlerrm = 'NOTREFUSED' then
      raise exception 'an invitation addressed to somebody else was accepted';
    end if;
    raise;
end $$;
rollback to savepoint before_wrong_address;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 Item56 an invitation addressed to somebody else cannot be borrowed"
from public.profiles where email = 'someone.else@example.invalid';

select case when used_at is null then 'PASS' else 'FAIL it was consumed' end
  as "T11 Item56 and that invitation is still unused afterwards"
from public.invitations where token = 'inv-token-forsomeone-0003';

-- ------------------------------------------------------ case does not matter --

insert into public.invitations (token, email, created_by, expires_at)
values ('inv-token-case-0004', 'Mixed.Case@Example.Invalid',
        (select id from public.profiles order by created_at limit 1),
        now() + interval '2 days');

insert into auth.users (id, email, raw_user_meta_data)
values ('c0c0c0c0-0000-4000-8000-00000000000f'::uuid,
        'mixed.case@example.invalid',
        jsonb_build_object('first_name', 'Mixed', 'last_name', 'Case'));

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 Item56 an address invited in one case registers in another"
from public.profiles where email = 'mixed.case@example.invalid';
