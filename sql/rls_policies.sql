-- ============================================================================
-- Jericho Platform — RLS Policies, Triggers, and Security-Definer Functions
-- Run this AFTER schema.sql, in the Supabase SQL Editor.
--
-- Everything that enforces the anonymity/role model lives here, in Postgres,
-- not in the frontend. The frontend only ever gets what these policies and
-- functions choose to hand back.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS
--
-- SECURITY DEFINER + a fixed search_path here on purpose: these are called
-- FROM inside RLS policies on `profiles` itself. If they were plain
-- (SECURITY INVOKER) functions, their internal "select ... from profiles"
-- would re-trigger the very RLS policy that's calling them, which is a
-- documented Postgres RLS recursion trap. Running as definer with RLS
-- effectively bypassed for this narrow, read-only lookup breaks that cycle.
-- Fixing search_path prevents a search-path hijack from redirecting these
-- definer functions to a malicious same-named function.
-- ----------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_operator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'operator' and status = 'approved'
  );
$$;

create or replace function public.is_approved_participant()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and status = 'approved'
  );
$$;

-- ----------------------------------------------------------------------------
-- ACTIVITY LOG helper (used by other functions/triggers below)
-- ----------------------------------------------------------------------------
create or replace function public.log_activity(p_user_id uuid, p_action text, p_details jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity_log (user_id, action, details) values (p_user_id, p_action, p_details);
$$;

-- ----------------------------------------------------------------------------
-- NEW USER → PROFILE
--
-- Fires on every Supabase Auth signup. This is the ONLY path that creates a
-- profiles row (there is no client-facing INSERT policy on profiles at all —
-- see below). role and status are hardcoded here to 'participant' / 'pending'
-- regardless of anything the client sent in signUp() metadata, which is what
-- makes self-registration-as-operator or self-approval impossible.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, first_name, last_name, company, email, phone, country, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'company',
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'country', ''),
    'participant',   -- hardcoded, never taken from client input
    'pending'        -- hardcoded, never taken from client input
  );

  perform public.log_activity(
    (select id from public.profiles where user_id = new.id),
    'user_registered',
    jsonb_build_object('email', lower(new.email))
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- PROFILE COLUMN PROTECTION
--
-- RLS gets a participant to "their own row" — but row-level security alone
-- can't stop them from writing role='operator' or status='approved' into
-- that row. This trigger enforces the column-level rule: non-operators
-- cannot change role, status, email, or user_id, no matter what UPDATE
-- statement they send. Operators are exempt (they approve/reject/promote
-- through this same path).
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

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ----------------------------------------------------------------------------
-- LISTING STATUS PROTECTION
--
-- Section 8: participants may set Available / Under Review / Closed;
-- only Operators may set Negotiation / Archived, or change listing
-- ownership / reference number.
-- ----------------------------------------------------------------------------
create or replace function public.protect_listing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operator() then
    new.user_id := old.user_id;
    new.reference_number := old.reference_number;
    if new.status is distinct from old.status
       and new.status not in ('available','under_review','closed') then
      raise exception 'Participants may only set status to available, under_review, or closed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_listing_columns on public.listings;
create trigger trg_protect_listing_columns
  before update on public.listings
  for each row execute function public.protect_listing_columns();

-- ----------------------------------------------------------------------------
-- DOCUMENT REQUEST COLUMN PROTECTION
--
-- Section 14: the participant may only respond (status: confirmed/
-- unavailable, plus responded_at). They must not be able to rewrite which
-- document was asked for, which listing it's tied to, or who requested it.
-- ----------------------------------------------------------------------------
create or replace function public.protect_document_request_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operator() then
    new.listing_id := old.listing_id;
    new.requester_id := old.requester_id;
    new.participant_id := old.participant_id;
    new.doc_type := old.doc_type;
    if new.status is distinct from old.status and new.status not in ('confirmed','unavailable') then
      raise exception 'Participants may only set status to confirmed or unavailable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_document_request_columns on public.document_requests;
create trigger trg_protect_document_request_columns
  before update on public.document_requests
  for each row execute function public.protect_document_request_columns();

-- ----------------------------------------------------------------------------
-- INVITATIONS: token validation without exposing the table
--
-- get_invitation_by_token: usable by an anonymous visitor (they don't have a
-- session yet), returns exactly one row matching the exact token, and only
-- if it's unused and unexpired. There is no way to list or search invitations
-- through this function — it's a single exact-match lookup.
--
-- mark_invitation_used: called right after auth.signUp() succeeds. Takes the
-- token and derives the acting user from auth.uid() internally (never from a
-- client-supplied user id), so it can only ever mark a token used by the
-- person who is actually now authenticated as that new user.
-- ----------------------------------------------------------------------------
create or replace function public.get_invitation_by_token(p_token text)
returns table (id uuid, email text, expires_at timestamptz, used_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.email, i.expires_at, i.used_at
  from public.invitations i
  where i.token = p_token
  limit 1;
$$;

create or replace function public.mark_invitation_used(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations%rowtype;
  v_profile_id uuid;
begin
  select * into v_invitation from public.invitations where token = p_token for update;

  if v_invitation.id is null then
    raise exception 'Invalid invitation token';
  end if;
  if v_invitation.used_at is not null then
    raise exception 'Invitation already used';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'Invitation expired';
  end if;

  select id into v_profile_id from public.profiles where user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'No authenticated profile to attach this invitation to';
  end if;

  update public.invitations
    set used_at = now(), used_by = v_profile_id
    where id = v_invitation.id;

  return true;
end;
$$;

grant execute on function public.get_invitation_by_token(text) to anon, authenticated;
grant execute on function public.mark_invitation_used(text) to authenticated;

-- ----------------------------------------------------------------------------
-- REFERENCE NUMBERS — atomic, race-free
-- Format: SELL-26-001 / BUY-26-001 (2-digit year, 3-digit zero-padded seq).
-- The INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING pattern takes a row
-- lock on the counter row, so two simultaneous listing creations cannot both
-- read the same "current" value.
-- ----------------------------------------------------------------------------
create or replace function public.next_reference(p_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_year text := to_char(now(), 'YY');
  v_key text;
  v_seq integer;
begin
  if p_type = 'sell' then
    v_prefix := 'SELL';
  elsif p_type = 'buy' then
    v_prefix := 'BUY';
  else
    raise exception 'Unknown listing type: %', p_type;
  end if;
  v_key := v_prefix || '-' || v_year;

  insert into public.reference_counters (key, last_value)
    values (v_key, 1)
    on conflict (key) do update set last_value = public.reference_counters.last_value + 1
    returning last_value into v_seq;

  return v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

grant execute on function public.next_reference(text) to authenticated;

-- ----------------------------------------------------------------------------
-- PUBLIC (ANONYMOUS) LISTINGS VIEW
--
-- This is the ONLY way a participant reads another participant's listing.
-- It deliberately omits user_id, specification, price_conditions, notes, and
-- per-document-type detail — exposing just what Section 10 lists: reference
-- number, commodity, quantity/unit, incoterm, region, aggregate document
-- indication (yes/no, not which ones), status, and date.
--
-- "Region" reuses the origin/destination field (there is no separate region
-- column in the spec's listing model) — origin for Sell, destination for Buy.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_listings()
returns table (
  id uuid, reference_number text, type text, commodity text,
  quantity numeric, unit text, incoterm text, region text,
  status text, has_documents boolean, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id, l.reference_number, l.type, l.commodity,
    l.quantity, l.unit, l.incoterm,
    case when l.type = 'sell' then l.origin else l.destination end as region,
    l.status,
    exists (
      select 1 from public.document_checklist dc
      where dc.listing_id = l.id and dc.indicated = true
    ) as has_documents,
    l.created_at, l.updated_at
  from public.listings l
  where l.status <> 'archived';
$$;

grant execute on function public.get_public_listings() to authenticated;

-- ----------------------------------------------------------------------------
-- MATCHING ENGINE (rule-based — no ML, no external calls)
--
-- Candidate pairs: same commodity (case-insensitive), opposite type, and
-- neither side archived/closed. Score is the count of extra aligned factors:
--   +1 quantity roughly compatible (both specified, ratio within 0.5x-2x)
--   +1 incoterm matches exactly
--   +1 origin/destination share a case-insensitive substring
-- 3 factors -> high, 1-2 -> medium, 0 -> low. Purely arithmetic/string
-- comparison — explicitly not a machine-learning model.
-- ----------------------------------------------------------------------------
create or replace function public.generate_matches_for_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_other record;
  v_factors integer;
  v_score text;
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    return;
  end if;

  for v_other in
    select * from public.listings
    where id <> v_listing.id
      and type <> v_listing.type
      and lower(commodity) = lower(v_listing.commodity)
      and status not in ('archived','closed')
  loop
    v_factors := 0;

    if v_listing.quantity is not null and v_other.quantity is not null
       and v_other.quantity between v_listing.quantity * 0.5 and v_listing.quantity * 2 then
      v_factors := v_factors + 1;
    end if;

    if v_listing.incoterm = v_other.incoterm then
      v_factors := v_factors + 1;
    end if;

    if coalesce(v_listing.origin, v_listing.destination) is not null
       and coalesce(v_other.origin, v_other.destination) is not null
       and lower(coalesce(v_other.origin, v_other.destination)) like
           '%' || lower(coalesce(v_listing.origin, v_listing.destination)) || '%'
    then
      v_factors := v_factors + 1;
    end if;

    v_score := case when v_factors >= 3 then 'high' when v_factors >= 1 then 'medium' else 'low' end;

    insert into public.matches (listing_a_id, listing_b_id, score, status)
      values (
        least(v_listing.id, v_other.id),
        greatest(v_listing.id, v_other.id),
        v_score, 'new'
      )
    on conflict (listing_a_id, listing_b_id) do update
      set score = excluded.score;

    -- Notify Operators only (Section 15: matches are Operator-visible only)
    insert into public.notifications (user_id, type, message, related_id)
    select p.id, 'match_found',
           'New ' || v_score || ' match for ' || v_listing.reference_number || ' / ' || v_other.reference_number,
           v_listing.id
    from public.profiles p where p.role = 'operator' and p.status = 'approved';
  end loop;
end;
$$;

create or replace function public.trg_generate_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_matches_for_listing(new.id);
  return new;
end;
$$;

drop trigger if exists on_listing_matchable on public.listings;
create trigger on_listing_matchable
  after insert or update of status, quantity, commodity, incoterm, origin, destination on public.listings
  for each row execute function public.trg_generate_matches();

-- ----------------------------------------------------------------------------
-- REMINDERS (30-day stale listing check)
-- Called by a scheduled GitHub Actions job using the service_role key (not
-- exposed to participants/anon/authenticated — see grants at the end).
-- ----------------------------------------------------------------------------
create or replace function public.send_listing_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_listing record;
begin
  for v_listing in
    select * from public.listings
    where status in ('available','under_review','negotiation')
      and coalesce(last_reminder_at, created_at) < now() - interval '30 days'
  loop
    insert into public.notifications (user_id, type, message, related_id)
      values (v_listing.user_id, 'listing_reminder',
              'Your listing ' || v_listing.reference_number || ' is over 30 days old — please confirm it is still valid or remove it.',
              v_listing.id);
    update public.listings set last_reminder_at = now() where id = v_listing.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.send_listing_reminders() from public, anon, authenticated;
grant execute on function public.send_listing_reminders() to service_role;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY on every table
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.commodities enable row level security;
alter table public.reference_counters enable row level security;
alter table public.listings enable row level security;
alter table public.document_checklist enable row level security;
alter table public.document_requests enable row level security;
alter table public.messages enable row level security;
alter table public.message_forward_log enable row level security;
alter table public.activity_log enable row level security;
alter table public.matches enable row level security;
alter table public.notifications enable row level security;

-- reference_counters: no policies at all -> only next_reference() (definer) can touch it.

-- ----------------------------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (user_id = auth.uid() or public.is_operator());

-- No insert policy: rows are created only via handle_new_user() (definer).

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (user_id = auth.uid() or public.is_operator());

-- ----------------------------------------------------------------------------
-- INVITATIONS  (Operator-only direct access; anon/participant use the RPCs)
-- ----------------------------------------------------------------------------
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select
  using (public.is_operator());

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert
  with check (public.is_operator());

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations for update
  using (public.is_operator());

-- ----------------------------------------------------------------------------
-- COMMODITIES  (readable by any signed-in user, writable by Operators only)
-- ----------------------------------------------------------------------------
drop policy if exists commodities_select on public.commodities;
create policy commodities_select on public.commodities for select
  using (auth.uid() is not null);

drop policy if exists commodities_insert on public.commodities;
create policy commodities_insert on public.commodities for insert
  with check (public.is_operator());

drop policy if exists commodities_update on public.commodities;
create policy commodities_update on public.commodities for update
  using (public.is_operator());

drop policy if exists commodities_delete on public.commodities;
create policy commodities_delete on public.commodities for delete
  using (public.is_operator());

-- ----------------------------------------------------------------------------
-- LISTINGS
-- Direct table access is OWN ROWS or Operator only. Anonymous browsing of
-- other participants' listings goes exclusively through get_public_listings().
-- ----------------------------------------------------------------------------
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select
  using (user_id = public.current_profile_id() or public.is_operator());

drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert
  with check (
    user_id = public.current_profile_id()
    and (public.is_approved_participant() or public.is_operator())
  );

drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update
  using (user_id = public.current_profile_id() or public.is_operator());

drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete
  using (user_id = public.current_profile_id() or public.is_operator());

-- ----------------------------------------------------------------------------
-- DOCUMENT CHECKLIST  (listing owner or Operator; never other participants)
-- ----------------------------------------------------------------------------
drop policy if exists document_checklist_select on public.document_checklist;
create policy document_checklist_select on public.document_checklist for select
  using (
    public.is_operator()
    or exists (select 1 from public.listings l where l.id = public.document_checklist.listing_id and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_insert on public.document_checklist;
create policy document_checklist_insert on public.document_checklist for insert
  with check (
    public.is_operator()
    or exists (select 1 from public.listings l where l.id = public.document_checklist.listing_id and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_update on public.document_checklist;
create policy document_checklist_update on public.document_checklist for update
  using (
    public.is_operator()
    or exists (select 1 from public.listings l where l.id = public.document_checklist.listing_id and l.user_id = public.current_profile_id())
  );

drop policy if exists document_checklist_delete on public.document_checklist;
create policy document_checklist_delete on public.document_checklist for delete
  using (
    public.is_operator()
    or exists (select 1 from public.listings l where l.id = public.document_checklist.listing_id and l.user_id = public.current_profile_id())
  );

-- ----------------------------------------------------------------------------
-- DOCUMENT REQUESTS
-- ----------------------------------------------------------------------------
drop policy if exists document_requests_select on public.document_requests;
create policy document_requests_select on public.document_requests for select
  using (participant_id = public.current_profile_id() or public.is_operator());

drop policy if exists document_requests_insert on public.document_requests;
create policy document_requests_insert on public.document_requests for insert
  with check (public.is_operator() and requester_id = public.current_profile_id());

drop policy if exists document_requests_update on public.document_requests;
create policy document_requests_update on public.document_requests for update
  using (participant_id = public.current_profile_id() or public.is_operator());

-- ----------------------------------------------------------------------------
-- MESSAGES (mailbox)
-- A participant sees: messages they sent, plus messages an Operator has
-- forwarded to them (via message_forward_log.to_user_id). They never see
-- another participant's outbound messages directly.
-- ----------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (
    sender_id = public.current_profile_id()
    or public.is_operator()
    or exists (
      -- public.messages.id must be spelled out in full. A bare `id` here
      -- resolves to message_forward_log.id (the inner FROM wins the name),
      -- making the condition f.message_id = f.id, which is never true — that
      -- silently broke forwarded-message delivery until a live test caught it.
      select 1 from public.message_forward_log f
      where f.message_id = public.messages.id
        and f.to_user_id = public.current_profile_id()
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id = public.current_profile_id()
    and (public.is_approved_participant() or public.is_operator())
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  using (public.is_operator());

-- ----------------------------------------------------------------------------
-- MESSAGE FORWARD LOG
-- Operators manage it; a recipient can read their own forward records so the
-- messages_select EXISTS-subquery above actually resolves for them.
-- ----------------------------------------------------------------------------
drop policy if exists message_forward_log_select on public.message_forward_log;
create policy message_forward_log_select on public.message_forward_log for select
  using (to_user_id = public.current_profile_id() or public.is_operator());

drop policy if exists message_forward_log_insert on public.message_forward_log;
create policy message_forward_log_insert on public.message_forward_log for insert
  with check (public.is_operator() and operator_id = public.current_profile_id());

-- ----------------------------------------------------------------------------
-- ACTIVITY LOG  (Operator-only read; anyone can log their own actions)
-- ----------------------------------------------------------------------------
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select
  using (public.is_operator());

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert
  with check (user_id = public.current_profile_id() or public.is_operator());

-- ----------------------------------------------------------------------------
-- MATCHES  (Operator-only; rows are actually written by the definer trigger)
-- ----------------------------------------------------------------------------
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select
  using (public.is_operator());

drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update
  using (public.is_operator());

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (user_id = public.current_profile_id() or public.is_operator());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (user_id = public.current_profile_id() or public.is_operator());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (public.is_operator());

-- ============================================================================
-- TABLE-LEVEL GRANTS
--
-- RLS policies above decide which ROWS a query can see/touch; Postgres also
-- requires a baseline table-level GRANT before RLS is even consulted. Stated
-- explicitly here rather than assumed, so this script is self-contained
-- regardless of a given Supabase project's default privileges.
-- `anon` gets nothing at the table level — pre-login access goes exclusively
-- through get_invitation_by_token(), already granted above.
-- reference_counters gets no grants at all: only next_reference() (definer)
-- may touch it.
-- ============================================================================
grant usage on schema public to authenticated, anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.invitations to authenticated;
grant select, insert, update, delete on public.commodities to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update, delete on public.document_checklist to authenticated;
grant select, insert, update on public.document_requests to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert on public.message_forward_log to authenticated;
grant select, insert on public.activity_log to authenticated;
grant select, update on public.matches to authenticated;
grant select, insert, update on public.notifications to authenticated;
