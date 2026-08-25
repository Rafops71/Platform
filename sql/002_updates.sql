-- ============================================================================
-- Jericho Platform — Update 002
--
-- Run this AFTER schema.sql and rls_policies.sql, in the Supabase SQL Editor.
-- Safe to re-run (every statement is guarded or CREATE OR REPLACE).
--
-- Contains:
--   1. FIX: profile column-protection trigger blocked the SQL-Editor
--      bootstrap of the first Operator.
--   2. Backend-enforced activity logging (Section 16) via triggers.
--   3. Backend-enforced notifications (Section 12) via triggers.
--   4. Operator manual listing reminder (Section 8/12).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX — first Operator bootstrap
--
-- Bug this fixes: protect_profile_columns() reverted role/status whenever
-- is_operator() was false. In the Supabase SQL Editor there is no end-user
-- session, so auth.uid() is NULL, is_operator() returns false, and the
-- trigger silently reverted the very UPDATE meant to create the first
-- Operator. The update "succeeded" while changing nothing.
--
-- The fix exempts privileged database roles (the SQL Editor runs as
-- postgres; scheduled jobs use service_role). This does NOT weaken the rule
-- for app users: every request from the browser arrives as `authenticated`
-- or `anon`, neither of which is exempt here, so a participant still cannot
-- change their own role, status, email, or user_id. Being able to bypass it
-- requires direct database access, which is already full control.
-- ----------------------------------------------------------------------------
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
    new.email := old.email;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. ACTIVITY LOG — enforced in the database, not the browser
--
-- Section 16 requires an audit trail. Logging only from the frontend is
-- unreliable (a failed request, a closed tab, or a direct API call all skip
-- it), and Section 20 requires business rules on the backend. These triggers
-- make the log a property of the data change itself.
--
-- Note on the actor: these run as the definer, so they record
-- current_profile_id() — the app user whose session made the change — and
-- NULL for privileged/system changes, which then display as "System".
-- ----------------------------------------------------------------------------

create or replace function public.trg_log_listing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (user_id, action, details)
      values (v_actor, 'listing_created',
              jsonb_build_object('listing_id', new.id, 'reference_number', new.reference_number,
                                 'type', new.type, 'commodity', new.commodity));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.activity_log (user_id, action, details)
        values (v_actor, 'listing_status_changed',
                jsonb_build_object('listing_id', new.id, 'reference_number', new.reference_number,
                                   'from', old.status, 'to', new.status));
    end if;
    -- Any other field change counts as an edit (Section 8: edits are logged).
    if (new.commodity, new.quantity, new.unit, new.specification, new.incoterm,
        new.origin, new.destination, new.price_conditions, new.currency, new.notes)
       is distinct from
       (old.commodity, old.quantity, old.unit, old.specification, old.incoterm,
        old.origin, old.destination, old.price_conditions, old.currency, old.notes) then
      insert into public.activity_log (user_id, action, details)
        values (v_actor, 'listing_edited',
                jsonb_build_object('listing_id', new.id, 'reference_number', new.reference_number));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log (user_id, action, details)
      values (v_actor, 'listing_removed',
              jsonb_build_object('listing_id', old.id, 'reference_number', old.reference_number));
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_listing_change on public.listings;
create trigger trg_log_listing_change
  after insert or update or delete on public.listings
  for each row execute function public.trg_log_listing_change();

create or replace function public.trg_log_checklist_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
begin
  -- Only log meaningful changes: a listing save upserts all 15 document
  -- rows, and logging every untouched row would bury the real history.
  if tg_op = 'INSERT' and new.indicated = false then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.indicated is not distinct from old.indicated then
    return new;
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_actor, 'document_checklist_updated',
            jsonb_build_object('listing_id', new.listing_id, 'doc_type', new.doc_type,
                               'indicated', new.indicated));
  return new;
end;
$$;

drop trigger if exists trg_log_checklist_change on public.document_checklist;
create trigger trg_log_checklist_change
  after insert or update on public.document_checklist
  for each row execute function public.trg_log_checklist_change();

create or replace function public.trg_log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  return new;
end;
$$;

drop trigger if exists trg_log_profile_change on public.profiles;
create trigger trg_log_profile_change
  after update on public.profiles
  for each row execute function public.trg_log_profile_change();

create or replace function public.trg_log_doc_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'document_request_sent',
              jsonb_build_object('request_id', new.id, 'listing_id', new.listing_id,
                                 'doc_type', new.doc_type));
  elsif new.status is distinct from old.status then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'document_request_response',
              jsonb_build_object('request_id', new.id, 'doc_type', new.doc_type,
                                 'status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_doc_request_change on public.document_requests;
create trigger trg_log_doc_request_change
  after insert or update on public.document_requests
  for each row execute function public.trg_log_doc_request_change();

create or replace function public.trg_log_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (user_id, action, details)
    values (new.sender_id, 'mailbox_message_sent',
            jsonb_build_object('message_id', new.id, 'listing_id', new.listing_id));
  return new;
end;
$$;

drop trigger if exists trg_log_message_insert on public.messages;
create trigger trg_log_message_insert
  after insert on public.messages
  for each row execute function public.trg_log_message_insert();

create or replace function public.trg_log_message_forward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (user_id, action, details)
    values (new.operator_id, 'mailbox_message_forwarded',
            jsonb_build_object('message_id', new.message_id, 'to_user_id', new.to_user_id));
  return new;
end;
$$;

drop trigger if exists trg_log_message_forward on public.message_forward_log;
create trigger trg_log_message_forward
  after insert on public.message_forward_log
  for each row execute function public.trg_log_message_forward();

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATIONS — enforced in the database (Section 12)
--
-- These run as definer (owner: postgres), which bypasses RLS, so a
-- participant's own INSERT can still generate notifications addressed to
-- Operators without granting the participant any ability to write
-- notifications directly.
-- ----------------------------------------------------------------------------

create or replace function public.notify_operators(p_type text, p_message text, p_related_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, message, related_id)
  select p.id, p_type, p_message, p_related_id
  from public.profiles p
  where p.role = 'operator' and p.status = 'approved';
$$;

-- New pending registration -> notify Operators
create or replace function public.trg_notify_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.notify_operators(
      'new_registration',
      'New registration awaiting approval: ' || new.first_name || ' ' || new.last_name || ' (' || new.email || ')',
      new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_registration on public.profiles;
create trigger trg_notify_new_registration
  after insert on public.profiles
  for each row execute function public.trg_notify_new_registration();

-- New listing -> notify Operators
create or replace function public.trg_notify_new_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_operators(
    'new_listing',
    'New ' || (case when new.type = 'sell' then 'Sell Offer' else 'Buy Request' end) ||
      ' ' || new.reference_number || ' — ' || new.commodity,
    new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_new_listing on public.listings;
create trigger trg_notify_new_listing
  after insert on public.listings
  for each row execute function public.trg_notify_new_listing();

-- Listing status changed -> notify the listing owner (Section 12)
create or replace function public.trg_notify_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, type, message, related_id)
      values (new.user_id, 'listing_status_changed',
              'Status of ' || new.reference_number || ' changed to ' || new.status || '.',
              new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_listing_status on public.listings;
create trigger trg_notify_listing_status
  after update on public.listings
  for each row execute function public.trg_notify_listing_status();

-- New mailbox message -> notify Operators (Section 12)
create or replace function public.trg_notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_operator boolean;
begin
  -- An Operator's own reply shouldn't notify the Operators about itself.
  select (role = 'operator') into v_is_operator from public.profiles where id = new.sender_id;
  if coalesce(v_is_operator, false) = false then
    perform public.notify_operators('new_message', 'New mailbox message awaiting review.', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.trg_notify_new_message();

-- Document request response -> notify Operators (Section 12/14)
create or replace function public.trg_notify_doc_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'unavailable') then
    perform public.notify_operators(
      'document_request_response',
      'Document request "' || new.doc_type || '" was marked ' || new.status || '.',
      new.listing_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_doc_request_response on public.document_requests;
create trigger trg_notify_doc_request_response
  after update on public.document_requests
  for each row execute function public.trg_notify_doc_request_response();

-- ----------------------------------------------------------------------------
-- 4. OPERATOR MANUAL REMINDER (Section 8: "Operators can also manually send
--    a reminder"). Definer + explicit operator check, because it writes a
--    notification addressed to another user.
-- ----------------------------------------------------------------------------
create or replace function public.send_manual_reminder(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
begin
  if not public.is_operator() then
    raise exception 'Only Operators may send reminders';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  insert into public.notifications (user_id, type, message, related_id)
    values (v_listing.user_id, 'listing_reminder',
            'An Operator asked you to confirm whether listing ' || v_listing.reference_number ||
            ' is still valid, or remove it.',
            v_listing.id);

  update public.listings set last_reminder_at = now() where id = p_listing_id;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'listing_reminder_sent',
            jsonb_build_object('listing_id', p_listing_id));
end;
$$;

grant execute on function public.send_manual_reminder(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Registration approved -> notify the participant (Section 12)
--    Done in the database so the notification cannot be lost if the Operator's
--    browser drops the follow-up request after the status update succeeds.
-- ----------------------------------------------------------------------------
create or replace function public.trg_notify_profile_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status = 'approved' then
    insert into public.notifications (user_id, type, message, related_id)
      values (new.id, 'registration_approved',
              'Your registration has been approved. You can now sign in.', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_profile_approved on public.profiles;
create trigger trg_notify_profile_approved
  after update on public.profiles
  for each row execute function public.trg_notify_profile_approved();

-- ----------------------------------------------------------------------------
-- 6. FIX — forwarded mailbox messages never reached their recipient
--
-- The original messages_select policy correlated the sub-query with a bare
-- `id`. Inside "select 1 from message_forward_log f", the name `id` resolves
-- to message_forward_log.id, not messages.id, so the test was effectively
-- f.message_id = f.id — never true. Result: an Operator could forward a
-- message and the recipient would still see nothing, silently breaking the
-- core Section 11 flow. Caught by executing the policy against a real
-- Postgres, not by reading it.
--
-- The fix spells out public.messages.id. The same qualification is applied to
-- the document_checklist policies, which relied on the same kind of implicit
-- outer-column reference.
-- ----------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (
    sender_id = public.current_profile_id()
    or public.is_operator()
    or exists (
      select 1 from public.message_forward_log f
      where f.message_id = public.messages.id
        and f.to_user_id = public.current_profile_id()
    )
  );

drop policy if exists document_checklist_select on public.document_checklist;
create policy document_checklist_select on public.document_checklist for select
  using (
    public.is_operator()
    or exists (select 1 from public.listings l
               where l.id = public.document_checklist.listing_id
                 and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_insert on public.document_checklist;
create policy document_checklist_insert on public.document_checklist for insert
  with check (
    public.is_operator()
    or exists (select 1 from public.listings l
               where l.id = public.document_checklist.listing_id
                 and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_update on public.document_checklist;
create policy document_checklist_update on public.document_checklist for update
  using (
    public.is_operator()
    or exists (select 1 from public.listings l
               where l.id = public.document_checklist.listing_id
                 and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_delete on public.document_checklist;
create policy document_checklist_delete on public.document_checklist for delete
  using (
    public.is_operator()
    or exists (select 1 from public.listings l
               where l.id = public.document_checklist.listing_id
                 and l.user_id = public.current_profile_id())
  );
