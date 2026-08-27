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
