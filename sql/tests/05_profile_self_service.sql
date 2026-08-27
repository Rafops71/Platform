-- 05_profile_self_service.sql
--
-- What the database is responsible for now that a participant maintains their
-- own account details: the fields they may edit, the fields they may not, and
-- the audit trail both leave behind.
--
-- The two that matter are email and password, because neither is really the
-- profile's to change. auth.users is the system of record for both. A
-- participant who could write profiles.email directly could sign in as one
-- address while notification mail went to another, which is a way to aim
-- someone else's mail at yourself — so the column stays pinned exactly as it
-- was, and moves only when Auth moves it. These assertions are the proof that
-- the door opened for the mirror did not open for anyone else.

\set QUIET on
\pset pager off

\echo
\echo '=========== PROFILE SELF-SERVICE ==========='

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid,
  'self-service@example.invalid',
  'hash-one',
  jsonb_build_object(
    'first_name', 'Paula', 'last_name', 'Perfil', 'phone', '+3200000011',
    'country', 'Belgium', 'language', 'en', 'company', 'Old Company'
  )
);

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid,
  'other-participant@example.invalid',
  'hash-two',
  jsonb_build_object(
    'first_name', 'Otto', 'last_name', 'Otro', 'phone', '+3200000012',
    'country', 'Spain', 'language', 'es'
  )
);

update public.profiles set status = 'approved'
where email in ('self-service@example.invalid', 'other-participant@example.invalid');

-- A participant editing their own details, exactly as the Profile page does.
set role authenticated; set test.uid='b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
update public.profiles
   set first_name = 'Paulina', company = 'New Company', country = 'Spain',
       phone = '+3299999999', job_title = 'Head of Trading', language = 'es'
 where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
reset role; reset test.uid;

select case when p.first_name = 'Paulina' and p.company = 'New Company'
             and p.country = 'Spain' and p.phone = '+3299999999'
             and p.job_title = 'Head of Trading' and p.language = 'es'
            then 'PASS' else 'FAIL' end
  as "T1 a participant can edit their own name, company, country, phone, job title and language"
from public.profiles p where p.email = 'self-service@example.invalid';

\echo
\echo '=========== WHAT STAYS LOCKED ==========='

set role authenticated; set test.uid='b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
update public.profiles set role = 'operator', status = 'suspended',
                           email = 'hijacked@example.invalid'
 where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
reset role; reset test.uid;

select case when p.role = 'participant' then 'PASS' else 'FAIL got ' || p.role end
  as "T2 a participant still cannot promote themselves to operator"
from public.profiles p where p.email = 'self-service@example.invalid';

select case when p.status = 'approved' then 'PASS' else 'FAIL got ' || p.status end
  as "T3 a participant still cannot change their own status"
from public.profiles p where p.email = 'self-service@example.invalid';

-- The point of the whole design: the new email path did not make the column
-- writable. A direct UPDATE is reverted as it always was.
select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T4 a participant cannot write profiles.email directly"
from public.profiles p where p.email = 'self-service@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T5 the address they tried to claim was never stored"
from public.profiles p where p.email = 'hijacked@example.invalid';

-- Nor anybody else's row, which RLS refuses before the trigger is reached.
set role authenticated; set test.uid='b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
update public.profiles set job_title = 'Impostor'
 where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid;
reset role; reset test.uid;

select case when p.job_title is null then 'PASS' else 'FAIL got ' || p.job_title end
  as "T6 a participant cannot edit another participant's profile"
from public.profiles p where p.email = 'other-participant@example.invalid';

\echo
\echo '=========== EMAIL FOLLOWS AUTH ==========='

-- What Supabase Auth does when the browser calls updateUser({ email }), once
-- the password has been re-checked. The mirror is the trigger's job.
update auth.users set email = 'moved@example.invalid'
 where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  as "T7 changing the auth email moves the profile email with it"
from public.profiles p where p.email = 'moved@example.invalid'
  and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 the email change is in the activity log"
from public.activity_log
where action = 'email_changed'
  and details ->> 'from' = 'self-service@example.invalid'
  and details ->> 'to' = 'moved@example.invalid';

-- The exemption is scoped to the syncing transaction, not left switched on.
-- If the GUC leaked, this second direct write would land.
set role authenticated; set test.uid='b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
update public.profiles set email = 'leaked@example.invalid'
 where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T9 the sync exemption does not leak into later statements"
from public.profiles p where p.email = 'leaked@example.invalid';

\echo
\echo '=========== PASSWORD CHANGES ARE NOTICED, NOT STORED ==========='

update auth.users set encrypted_password = 'hash-one-rotated'
 where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 a password change is logged"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'password_changed' and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

-- The hash is compared with itself and never read. Nothing that could help
-- anyone attack it may reach a table an operator can browse.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T11 no password hash is written into the activity log"
from public.activity_log
where details::text like '%hash-one%';

-- An update that touches neither address nor password is not an account event.
update auth.users set raw_user_meta_data = '{}'::jsonb
 where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T12 an unrelated auth update logs nothing"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'password_changed' and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

\echo
\echo '=========== PROFILE EDITS ARE LOGGED, VALUES ARE NOT ==========='

select case when count(*) >= 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T13 editing the profile writes a profile_updated entry"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'profile_updated' and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

select case when a.details -> 'fields' ? 'job_title'
             and a.details -> 'fields' ? 'language'
             and a.details -> 'fields' ? 'phone'
            then 'PASS' else 'FAIL got ' || coalesce(a.details ->> 'fields', 'null') end
  as "T14 the entry names which fields changed"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'profile_updated' and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid
order by a.created_at limit 1;

-- Names, numbers and job titles are personal data, and an audit trail that
-- copies them keeps a second copy for no reason. Which field changed is what
-- an audit answers; what it changed to is in the profile.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  as "T15 the entry does not copy the new values"
from public.activity_log
where action = 'profile_updated'
  and (details::text like '%+3299999999%' or details::text like '%Head of Trading%');

-- A no-op update must not manufacture an event, or the log fills with entries
-- for someone opening the page and pressing Save.
set role authenticated; set test.uid='b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
update public.profiles set first_name = first_name
 where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T16 saving without changing anything logs nothing"
from public.activity_log a
join public.profiles p on p.id = a.user_id
where a.action = 'profile_updated' and p.user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
