-- 010_terms_acceptance.sql
--
-- Records that a participant accepted the Terms & Conditions, and which
-- version of them, in which language, and when.
--
-- Why this is written by handle_new_user() rather than by the browser:
-- acceptance is evidence, and evidence that the client is trusted to file can
-- simply not be filed. A registration that skipped the checkbox would create a
-- profile with no acceptance row and nothing would notice. Writing it inside
-- the same trigger that creates the profile makes the two atomic - if there is
-- a participant, there is a record of what they accepted.
--
-- The checkbox on register.html is still required. It is what makes the
-- acceptance real for the person; this table is what makes it provable
-- afterwards.
--
-- The row is deliberately immutable: there is a select policy and an insert
-- policy, and no update or delete policy at all. An acceptance that could be
-- edited later would be worth nothing as a record.
--
-- Re-acceptance of a *new* version is an ordinary insert, which is why the
-- uniqueness constraint is on (profile_id, version) rather than on profile_id
-- alone. Accepting version 1.0 and later version 2.0 leaves two rows, and the
-- history of what someone agreed to over time is preserved.

-- ---------------------------------------------------------------- table ----

create table if not exists public.terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  version     text not null,
  language    text not null,
  accepted_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'terms_acceptances_language_check'
  ) then
    alter table public.terms_acceptances
      add constraint terms_acceptances_language_check
      check (language in ('en', 'es'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'terms_acceptances_unique_version'
  ) then
    alter table public.terms_acceptances
      add constraint terms_acceptances_unique_version
      unique (profile_id, version);
  end if;
end $$;

create index if not exists terms_acceptances_profile_idx
  on public.terms_acceptances (profile_id);

-- ------------------------------------------------------------------ RLS ----

alter table public.terms_acceptances enable row level security;

drop policy if exists terms_acceptances_select on public.terms_acceptances;
create policy terms_acceptances_select on public.terms_acceptances
  for select
  using (profile_id = public.current_profile_id() or public.is_operator());

-- Insert is for re-accepting a later version from inside the dashboard. The
-- registration row is written by handle_new_user(), which is SECURITY DEFINER
-- and bypasses this policy - it has to, because at that moment the profile
-- row is still being created.
--
-- Note this deliberately does NOT require is_approved_participant(): a person
-- accepting the terms is by definition not approved yet the first time, and a
-- pending participant re-accepting an updated version must not be blocked.
drop policy if exists terms_acceptances_insert on public.terms_acceptances;
create policy terms_acceptances_insert on public.terms_acceptances
  for insert
  with check (profile_id = public.current_profile_id());

-- No update policy and no delete policy, on purpose. See the header.

-- ---------------------------------------------------------------- grants ----
--
-- RLS decides which rows a query may touch, but Postgres requires a baseline
-- table-level grant before it even consults a policy. Stated explicitly here,
-- following the convention in rls_policies.sql, rather than relying on a given
-- Supabase project's default privileges.
--
-- select and insert only. No update and no delete, which makes the row
-- immutable at the privilege layer as well as the policy layer — the absent
-- policies alone would be enough, but an acceptance record is evidence, and
-- evidence is worth defending twice.
--
-- anon gets nothing: reading the terms needs no account (terms.html loads no
-- client at all), and accepting them happens through signup.
grant select, insert on public.terms_acceptances to authenticated;

-- The revoke is not redundant, and finding that out is the reason it is here.
-- A Supabase project carries default privileges that grant ALL on new tables
-- in the public schema to anon and authenticated, so the grant above is a
-- no-op there and update/delete arrive anyway. RLS still refuses them, because
-- there is no update or delete policy — but the privilege layer would have
-- been open, and only the policy layer was holding. Revoking makes the two
-- layers agree, and makes the local database and the live one behave the same.
revoke update, delete, truncate on public.terms_acceptances from authenticated;
revoke all on public.terms_acceptances from anon;

-- -------------------------------------------------- record on signup ----

-- Extends the existing trigger. Everything about the profile insert is
-- unchanged; the only addition is the acceptance row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
begin
  insert into public.profiles (user_id, first_name, last_name, company, email, phone, country, role, status, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'company',
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'country', ''),
    'participant',   -- hardcoded, never taken from client input
    'pending',       -- hardcoded, never taken from client input
    public.norm_lang(new.raw_user_meta_data->>'language')
  )
  returning id into v_profile_id;

  -- 'unrecorded' rather than skipping the insert: a missing row is ambiguous
  -- (did they not accept, or did the record fail?), whereas a row saying
  -- 'unrecorded' is unambiguous evidence that a registration arrived without a
  -- version attached, and an Operator can see it.
  insert into public.terms_acceptances (profile_id, version, language)
  values (
    v_profile_id,
    coalesce(nullif(new.raw_user_meta_data->>'terms_version', ''), 'unrecorded'),
    public.norm_lang(new.raw_user_meta_data->>'terms_language')
  );

  perform public.log_activity(
    v_profile_id,
    'user_registered',
    jsonb_build_object('email', lower(new.email))
  );

  return new;
end;
$function$;
