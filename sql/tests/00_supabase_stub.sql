-- Minimal stand-in for the Supabase-managed objects our scripts depend on,
-- so the real scripts can be executed and verified locally.
create extension if not exists pgcrypto;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  -- Only ever compared with itself, by sync_profile_email_from_auth(), to
  -- notice that Auth rewrote it. Nothing reads the value.
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
alter table auth.users add column if not exists encrypted_password text;

-- Supabase exposes the current user id via a JWT claim; locally we drive it
-- from a session GUC so tests can switch identities.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;        exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;  exception when duplicate_object then null; end $$;

-- An invitation for a test fixture.
--
-- sql/024 made registration invitation-only, enforced by handle_new_user().
-- That is the production rule and these suites must obey it rather than be
-- exempted from it - an exemption would mean the tests stop describing the
-- system anybody actually runs, which is the mistake this project has already
-- made once with the migration lists.
--
-- So every fixture that creates an auth user calls this first. It is a no-op
-- on an empty database, because the first account on an empty database needs
-- no invitation and there would be nobody to attribute one to.
--
-- 16_invitation_required.sql deliberately does NOT call it: proving the
-- refusal is the whole point of that file.
create or replace function public.test_invite(p_email text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.profiles) then
    return;   -- bootstrap: the first account needs no invitation
  end if;
  insert into public.invitations (token, email, created_by, expires_at)
  values (gen_random_uuid()::text, p_email,
          (select id from public.profiles order by created_at limit 1),
          now() + interval '1 day');
end;
$$;

-- Sign the newest published Terms for every approved participant who has not.
-- A fixture, like test_invite(): since sql/034 an unsigned member can neither
-- post, message nor browse, so suites that exercise those as a member give
-- their members a signature first. The signing route itself is proven by
-- sql/tests/19, through accept_terms() and registration.
create or replace function public.test_sign_approved()
returns void
language plpgsql
security definer
as $$
begin
  insert into public.terms_acceptances
    (profile_id, version, language, signed_name, signed_capacity, terms_sha256)
  select p.id, v.version, v.language, 'Test Signer', 'individual', v.sha256
    from public.profiles p
    cross join lateral (select version, language, sha256 from public.terms_versions
                         order by published_at desc limit 1) v
   where p.status = 'approved' and p.role = 'participant'
  on conflict (profile_id, version) do update
     set signed_name = excluded.signed_name, terms_sha256 = excluded.terms_sha256
   where public.terms_acceptances.signed_name is null;
end;
$$;
