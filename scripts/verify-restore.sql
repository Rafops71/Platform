-- Does the restored copy actually hold the platform?
--
-- Run against a throwaway PostgreSQL that a backup has just been restored
-- into. .github/workflows/backup.yml runs it on every backup, which is the
-- whole point: a backup nobody has restored is a hope, not a backup.
--
-- pg_restore is deliberately NOT run with --exit-on-error in that workflow. A
-- dump of a Supabase database refers to extensions, roles and schemas a plain
-- PostgreSQL has never had, and those errors are expected noise. If they
-- decided the outcome, every backup would look broken. So nothing in the
-- restore log decides anything - these assertions do, on the data that came
-- back.
--
-- Written to RAISE rather than to print PASS/FAIL, because this one is read by
-- a workflow step and not by scripts/checklist-report.js: psql with
-- ON_ERROR_STOP=1 turns a raised exception into a non-zero exit, and a non-zero
-- exit is what turns the job red.

\set ON_ERROR_STOP on
\timing off

-- 1. THE TABLES THAT MATTER. Not every table - the ones whose loss would end
--    the business. A restore missing any of these is not a restore.
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ' order by t) into v_missing
  from unnest(array[
    'profiles', 'listings', 'messages', 'message_forward_log',
    'activity_log', 'invitations', 'matches', 'notifications',
    'document_checklist', 'document_requests', 'saved_searches',
    'terms_acceptances', 'reference_counters', 'email_outbox'
  ]) as t
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = t
  );

  if v_missing is not null then
    raise exception 'The restored backup is missing these tables: %', v_missing;
  end if;
  raise notice 'All 14 core tables are present.';
end $$;

-- 2. THE MEMBERS CAME BACK. A structurally perfect restore with no people in
--    it is the failure that looks most like success: every table present,
--    every count zero. This is the assertion that catches a dump taken
--    against the wrong database, or one taken while something was broken.
do $$
declare
  v_profiles integer;
  v_operators integer;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles = 0 then
    raise exception 'The restored backup holds no profiles at all. A dump with no members in it is not a backup of this platform.';
  end if;

  select count(*) into v_operators from public.profiles
   where role = 'operator' and status = 'approved';
  if v_operators = 0 then
    raise exception 'The restored backup holds % profile(s) but no approved Operator. Restoring this would leave a platform nobody can run.', v_profiles;
  end if;

  raise notice 'Profiles restored: % (of which approved Operators: %).', v_profiles, v_operators;
end $$;

-- 3. THE SIGN-IN SIDE CAME BACK TOO. public.profiles is only half of a
--    member: Supabase keeps the credentials in auth.users, and a restore with
--    profiles but no auth rows gives everybody an account they cannot sign
--    into. This is why the dump asks for --schema=auth as well as public, and
--    this is what proves that flag is still there.
do $$
declare
  v_users integer;
  v_orphans integer;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'auth' and table_name = 'users') then
    raise exception 'The restored backup has no auth.users table. Every member would be unable to sign in. Check that pg_dump still passes --schema=auth.';
  end if;

  select count(*) into v_users from auth.users;
  if v_users = 0 then
    raise exception 'The restored backup has an empty auth.users. Nobody could sign in to this copy.';
  end if;

  select count(*) into v_orphans
    from public.profiles p
   where not exists (select 1 from auth.users u where u.id = p.user_id);
  if v_orphans > 0 then
    raise warning 'Restored copy has % profile(s) with no auth user. Not failing on it - the live database may be in that state too - but it is worth a look.', v_orphans;
  end if;

  raise notice 'Auth users restored: %.', v_users;
end $$;

-- 4. THE RECORD OF WHAT HAPPENED. The activity log is the evidence behind the
--    24-month commission claim in section 8 of the Terms. A backup that drops
--    it keeps the platform and loses the proof of what the platform did.
do $$
declare
  v_log integer;
begin
  select count(*) into v_log from public.activity_log;
  if v_log = 0 then
    raise exception 'The restored backup has an empty activity_log. That is the evidence behind the commission claim in the Terms; a backup without it is not enough.';
  end if;
  raise notice 'Activity log rows restored: %.', v_log;
end $$;

select 'the restored backup holds the platform' as verdict;
