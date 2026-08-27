-- 011_profile_self_service.sql
--
-- Lets a participant maintain their own account details: a new job_title
-- column, an email address that can be changed, and an audit trail for both.
--
-- The email is the interesting part. profiles.email was locked by
-- protect_profile_columns() - a participant sending an UPDATE with a new email
-- had it silently reverted - and that lock stays exactly as it was. What
-- changes is that the address is now allowed to move when Supabase Auth moves
-- it, and only then: auth.users is the system of record, public.profiles
-- mirrors it, and the mirror is maintained by a trigger rather than by the
-- browser.
--
-- That ordering matters. If the browser were trusted to write profiles.email
-- after calling auth.updateUser(), a participant could send the profile update
-- and skip the auth one, leaving an account that signs in as one address and
-- receives notification mail at another - which is a way to point someone
-- else's notifications at yourself. Deriving the profile from auth makes the
-- two impossible to separate: changing the address requires the password (the
-- browser reauthenticates before asking Auth), and the mirror follows without
-- being asked.
--
-- The password never appears here. It lives in auth.users.encrypted_password
-- and only Auth ever writes it; this migration only notices that it changed,
-- so that "the password was changed" is in the activity log like every other
-- account event.

-- ------------------------------------------------------------ job title ----

alter table public.profiles add column if not exists job_title text;

comment on column public.profiles.job_title is
  'Free text, participant-maintained. Never shown to other participants: '
  'listings are anonymous and this is one more thing that would identify.';

-- --------------------------------------------------- email, from auth only --
--
-- protect_profile_columns() still pins email for every non-operator caller.
-- The one exception is a transaction that has set jericho.email_sync, which
-- only sync_profile_email_from_auth() below does. A participant cannot set a
-- GUC through PostgREST - there is no SQL surface for it, only RPCs to
-- functions that exist - so this is not a door they can open for themselves.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Exempt only a direct database connection with NO end-user session.
  --
  -- The test is auth.uid() IS NULL, deliberately NOT a check on current_user:
  -- inside a SECURITY DEFINER function current_user is the function's OWNER
  -- (postgres), not the caller, so a role-name check here would exempt every
  -- caller — including a participant escalating their own role. Verified
  -- against a real Postgres: the role-name version let a participant become
  -- an operator; this version blocks it.
  --
  -- Why auth.uid() IS NULL is safe: every browser request carries a session,
  -- so auth.uid() is non-NULL for participants and operators alike. It is
  -- NULL only for the SQL Editor (which runs as postgres) and service_role
  -- jobs — both of which already have full database access. An unauthenticated
  -- (anon) request cannot reach this trigger at all: anon holds no UPDATE
  -- grant on profiles, and profiles_update requires user_id = auth.uid().
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;

  if not public.is_operator() then
    new.role := old.role;
    new.status := old.status;
    new.user_id := old.user_id;
    -- Email follows auth.users and nothing else. The GUC is set only inside
    -- sync_profile_email_from_auth(), for the duration of that one statement.
    if coalesce(current_setting('jericho.email_sync', true), '') <> 'on' then
      new.email := old.email;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ------------------------------------------------- auth.users → profiles ----
--
-- One trigger for both account events, because they arrive the same way: as an
-- update to auth.users that this database did not initiate. Email is mirrored;
-- the password is only noted.

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = new.id;
  if v_profile_id is null then
    return new;  -- an auth user with no profile yet: nothing to mirror onto
  end if;

  if new.email is distinct from old.email then
    perform set_config('jericho.email_sync', 'on', true);  -- true = this txn only
    update public.profiles set email = new.email where id = v_profile_id;
    perform set_config('jericho.email_sync', 'off', true);

    insert into public.activity_log (user_id, action, details)
      values (v_profile_id, 'email_changed',
              jsonb_build_object('from', old.email, 'to', new.email));
  end if;

  -- Auth rewrites the hash on every password change, so a different hash is
  -- the event. The hash itself is never read, compared, or logged.
  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.activity_log (user_id, action, details)
      values (v_profile_id, 'password_changed', jsonb_build_object('profile_id', v_profile_id));
  end if;

  return new;
end;
$$;

-- `update of` narrows this to statements that touch one of the two columns,
-- which keeps it off the path of an ordinary sign-in: GoTrue writes
-- last_sign_in_at on every login, and a trigger firing there would run a
-- profile lookup for every authentication on the platform to discover that
-- nothing had changed.
drop trigger if exists trg_sync_profile_email_from_auth on auth.users;
create trigger trg_sync_profile_email_from_auth
  after update of email, encrypted_password on auth.users
  for each row execute function public.sync_profile_email_from_auth();

-- ------------------------------------------------------- profile edit log --
--
-- The existing trigger logged only what an Operator does to somebody (status
-- and role). Now that a participant maintains the rest of the row themselves,
-- their own edits are logged too - which of the fields changed, never the
-- values, because a phone number or a job title in an audit trail is personal
-- data kept for no reason. Email is excluded here: it arrives through the auth
-- trigger above and would otherwise be logged twice.

create or replace function public.trg_log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
begin
  if new.status is distinct from old.status then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'user_status_changed',
              jsonb_build_object('profile_id', new.id, 'email', new.email,
                                 'from', old.status, 'to', new.status));
  end if;
  if new.role is distinct from old.role then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'user_role_changed',
              jsonb_build_object('profile_id', new.id, 'email', new.email,
                                 'from', old.role, 'to', new.role));
  end if;

  if new.first_name is distinct from old.first_name then v_changed := array_append(v_changed, 'first_name'); end if;
  if new.last_name  is distinct from old.last_name  then v_changed := array_append(v_changed, 'last_name');  end if;
  if new.company    is distinct from old.company    then v_changed := array_append(v_changed, 'company');    end if;
  if new.country    is distinct from old.country    then v_changed := array_append(v_changed, 'country');    end if;
  if new.phone      is distinct from old.phone      then v_changed := array_append(v_changed, 'phone');      end if;
  if new.job_title  is distinct from old.job_title  then v_changed := array_append(v_changed, 'job_title');  end if;
  if new.language   is distinct from old.language   then v_changed := array_append(v_changed, 'language');   end if;

  if array_length(v_changed, 1) > 0 then
    insert into public.activity_log (user_id, action, details)
      values (coalesce(public.current_profile_id(), new.id), 'profile_updated',
              jsonb_build_object('profile_id', new.id, 'fields', to_jsonb(v_changed)));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_profile_change on public.profiles;
create trigger trg_log_profile_change
  after update on public.profiles
  for each row execute function public.trg_log_profile_change();
