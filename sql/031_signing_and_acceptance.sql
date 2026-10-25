-- 031: signing the Terms - who signed, for whom, at what address, and proof
-- that survives the member's own deletion.
--
-- Decided with the owner, 2026-10-22..25 (docs/AGREED-2026-10-25.md, items
-- 10-15). Each part below says which decision it carries out.
--
-- WHAT WAS WRONG, read off the live database on 2026-10-25, not assumed:
--
--   terms_acceptances.profile_id ... ON DELETE CASCADE
--     Deleting a member deleted the proof that they accepted the Terms. The
--     Privacy Notice (section 10) promises those records "are kept for as long
--     as a claim arising from them could still be brought". The database did
--     the opposite: a member wanting out of the 24-month commission could ask
--     to be deleted and the evidence would go with them.
--
--   terms_acceptances_insert: with check (profile_id = current_profile_id())
--   plus an INSERT grant to authenticated.
--     Any member could write their own acceptance rows directly. Harmless
--     while a row held only a version string. Fatal once it holds a typed
--     signature and a frozen address: a member could manufacture whatever
--     signing record suited them. The same pattern sql/030 closed for the
--     activity log, closed the same way - one controlled door.
--
--   And: an acceptance recorded who and when, never on whose behalf, at what
--   address, or under what name typed as a signature.
--
-- WHAT THIS DOES
--
--   1. profiles gains a postal address and a signing capacity.
--   2. terms_acceptances keeps its rows when a member is deleted, and gains a
--      frozen copy of exactly what was signed.
--   3. terms_versions holds the canonical text of each published version, so
--      an acceptance points at a fixed text whose SHA-256 is recorded with it.
--   4. accept_terms() is the only way a member records an acceptance.
--   5. has_accepted_current_terms() is what the sign-in gate asks.
--   6. handle_new_user() records a full signature at registration when the
--      form supplied one, and an unsigned row otherwise - which the gate then
--      makes them sign at first sign-in.
--
-- NOT DONE HERE, and said plainly: the gate is enforced by the application at
-- sign-in, not by the posting and messaging policies themselves. A member who
-- bypasses the interface could still post before re-signing. Closing that
-- means changing is_approved_participant(), which every RLS policy for
-- posting depends on; it is recorded as follow-up work rather than slipped in.

begin;

-- ------------------------------------------------------------ 1. profiles --
-- Decision 11: street and number (+ a second line), city, postal code
-- (optional - the UAE and many others do not use them), country. The country
-- column already exists and is the address country.
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists postal_code text;
-- Decision 10: signing as an individual, or on behalf of a company.
alter table public.profiles add column if not exists signing_capacity text;
do $$ begin
  alter table public.profiles add constraint profiles_signing_capacity_check
    check (signing_capacity is null or signing_capacity in ('individual','company'));
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------- PO boxes --
-- Decision 11: no PO boxes. A court claim is delivered to a residence or a
-- place of business - the English rule is CPR 6.9, "usual or last known
-- residence", and the DIFC Courts' Rules Part 9 work on the same footing -
-- and nobody lives in a PO box. The wordings are the common ones in the
-- platform's two languages and the obvious neighbours; the page says so in
-- plain words before anyone types.
create or replace function public.looks_like_po_box(p text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p, '') ~* (
    '(\mp\.?\s*o\.?\s*box\M'          -- PO Box, P.O. Box, P O Box, PO.Box
    || '|\mpost\s*office\s*box\M'     -- Post Office Box
    || '|\mpob\M'                     -- POB
    || '|\mapartado(\s+de\s+correos)?\M|\mapdo\.?\s*\d'  -- Spanish
    || '|\mcasilla(\s+de\s+correos?)?\M'                 -- Latin America
    || '|\mcaixa\s+postal\M'                             -- Portuguese
    || '|\mpostfach\M'                                   -- German
    || '|\mbo[iî]te\s+postale\M)'                        -- French
  );
$$;

-- ---------------------------------------------------- 3. terms versions --
-- The canonical text of each published version, per language. An acceptance
-- records the hash of the row it accepted, so "exactly which text they
-- accepted" (decision 13) is a fact held by the server - not whatever a
-- browser said it displayed. Rows are written by migrations only.
create table if not exists public.terms_versions (
  version      text not null,
  language     text not null check (language in ('en','es')),
  text         text not null,
  sha256       text not null,
  published_at timestamptz not null default now(),
  primary key (version, language)
);
alter table public.terms_versions enable row level security;
drop policy if exists terms_versions_select on public.terms_versions;
create policy terms_versions_select on public.terms_versions for select using (true);
revoke all on public.terms_versions from anon, authenticated;
grant select on public.terms_versions to anon, authenticated;

-- ------------------------------------------------ 2. terms_acceptances --
-- Decision 14: survive deletion. SET NULL rather than CASCADE, and the frozen
-- copy below is what still identifies the signatory once the link is gone.
alter table public.terms_acceptances alter column profile_id drop not null;
alter table public.terms_acceptances
  drop constraint if exists terms_acceptances_profile_id_fkey;
alter table public.terms_acceptances
  add constraint terms_acceptances_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;

-- Decisions 12-13: the typed name, the capacity, and a frozen copy of every
-- detail as it stood at the moment of signing.
alter table public.terms_acceptances add column if not exists signed_name text;
alter table public.terms_acceptances add column if not exists signed_capacity text;
alter table public.terms_acceptances add column if not exists signed_details jsonb;
alter table public.terms_acceptances add column if not exists terms_sha256 text;
do $$ begin
  alter table public.terms_acceptances add constraint terms_acceptances_signed_capacity_check
    check (signed_capacity is null or signed_capacity in ('individual','company'));
exception when duplicate_object then null; end $$;

-- The direct route, closed. Writes come only through accept_terms() and
-- handle_new_user(), both SECURITY DEFINER, which RLS does not stop.
drop policy if exists terms_acceptances_insert on public.terms_acceptances;
revoke insert on public.terms_acceptances from authenticated;

-- ------------------------------------------------------ 4. accept_terms --
create or replace function public.accept_terms(
  p_version       text,
  p_language      text,
  p_signed_name   text,
  p_capacity      text,
  p_company       text,
  p_address_line1 text,
  p_address_line2 text,
  p_city          text,
  p_postal_code   text,
  p_country       text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile public.profiles%rowtype;
  v_terms   public.terms_versions%rowtype;
  v_name    text := btrim(coalesce(p_signed_name, ''));
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
begin
  select * into v_profile from public.profiles where user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'Your account is not active on this platform.' using errcode = '42501';
  end if;

  select * into v_terms from public.terms_versions
   where version = p_version and language = public.norm_lang(p_language);
  if v_terms.version is null then
    raise exception 'That version of the Terms is not one this platform has published.'
      using errcode = '22023';
  end if;

  -- The checks the form makes are made again here, because the form is not
  -- the lock. Each message is written for the member who will read it.
  if length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Please type your full name - first name and surname - as your signature.'
      using errcode = '22023';
  end if;
  if p_capacity not in ('individual','company') then
    raise exception 'Please say whether you sign as an individual or on behalf of a company.'
      using errcode = '22023';
  end if;
  if p_capacity = 'company' and v_company is null then
    raise exception 'Please give the name of the company you sign for.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_address_line1,'')), '') is null
     or nullif(btrim(coalesce(p_city,'')), '') is null
     or nullif(btrim(coalesce(p_country,'')), '') is null then
    raise exception 'Please give your full street address, city and country.' using errcode = '22023';
  end if;
  if public.looks_like_po_box(p_address_line1) or public.looks_like_po_box(p_address_line2) then
    raise exception 'A PO box cannot be used. Please give a street address where you live or work.'
      using errcode = '22023';
  end if;

  update public.profiles
     set address_line1 = btrim(p_address_line1),
         address_line2 = nullif(btrim(coalesce(p_address_line2,'')), ''),
         city          = btrim(p_city),
         postal_code   = nullif(btrim(coalesce(p_postal_code,'')), ''),
         country       = btrim(p_country),
         signing_capacity = p_capacity,
         company       = case when p_capacity = 'company' then v_company else company end
   where id = v_profile.id;

  -- Already signed this version: nothing to do, and nothing may change. A
  -- signed row is never rewritten, by anyone.
  if exists (select 1 from public.terms_acceptances
              where profile_id = v_profile.id and version = v_terms.version
                and signed_name is not null) then
    return;
  end if;

  -- An UNSIGNED row for this version (left by a registration that arrived
  -- without a complete signature) is completed rather than duplicated: the
  -- table is unique on (profile_id, version), so a plain insert would refuse
  -- the very signature the gate is asking for. The first draft did exactly
  -- that. Only a row with no signature can be completed - the WHERE below.
  insert into public.terms_acceptances
    (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
  values (
    v_profile.id, v_terms.version, v_terms.language, v_name, p_capacity,
    jsonb_build_object(
      'first_name', v_profile.first_name, 'last_name', v_profile.last_name,
      'email', v_profile.email, 'phone', v_profile.phone,
      'company', case when p_capacity = 'company' then v_company end,
      'address_line1', btrim(p_address_line1),
      'address_line2', nullif(btrim(coalesce(p_address_line2,'')), ''),
      'city', btrim(p_city),
      'postal_code', nullif(btrim(coalesce(p_postal_code,'')), ''),
      'country', btrim(p_country)
    ),
    v_terms.sha256
  )
  on conflict (profile_id, version) do update
     set language        = excluded.language,
         signed_name     = excluded.signed_name,
         signed_capacity = excluded.signed_capacity,
         signed_details  = excluded.signed_details,
         terms_sha256    = excluded.terms_sha256,
         accepted_at     = now()
   where public.terms_acceptances.signed_name is null;

  perform public.log_activity(v_profile.id, 'terms_accepted',
    jsonb_build_object('version', v_terms.version, 'language', v_terms.language,
                       'capacity', p_capacity));
end;
$function$;

-- -------------------------------------------- 5. has_accepted_current --
-- "Current" is the newest published version, held by the server - the
-- browser does not get to decide which version is in force.
create or replace function public.has_accepted_current_terms()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- With no version published there is nothing to accept, and the answer
  -- must be yes. Answering no would lock every member out of the platform the
  -- moment this function shipped ahead of the text it gates on - which is the
  -- first thing a draft of this function did.
  select case
    when not exists (select 1 from public.terms_versions) then true
    else exists (
      select 1
        from public.terms_acceptances a
        join public.profiles p on p.id = a.profile_id
       where p.user_id = auth.uid()
         and a.signed_name is not null
         and a.version = (select version from public.terms_versions
                           order by published_at desc limit 1)
    )
  end;
$$;

-- Supabase grants a new public-schema function to anon explicitly, so
-- "from public" alone leaves anon's own grant in place (found the hard way in
-- sql/030 - the live database disagreed with the test suite).
revoke execute on function public.accept_terms(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant  execute on function public.accept_terms(text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke execute on function public.has_accepted_current_terms() from public, anon;
grant  execute on function public.has_accepted_current_terms() to authenticated;
revoke execute on function public.looks_like_po_box(text) from public, anon;
grant  execute on function public.looks_like_po_box(text) to authenticated;

-- -------------------------------------------- 6. handle_new_user --
-- Rebuilt from the LIVE definition read on 2026-10-25 (identical to sql/024),
-- with one change at the acceptance insert: when the registration form sent a
-- complete, valid signature it is recorded in full; otherwise the row is
-- recorded unsigned, exactly as before, and has_accepted_current_terms() is
-- false until the member signs at first sign-in. Never raises over the
-- signature: an exception here aborts the whole signup with Supabase's
-- generic "Database error saving new user", which tells the person nothing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_invitation_id uuid;
  v_bootstrap boolean;
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := btrim(coalesce(m->>'signed_name', ''));
  v_cap  text := m->>'signing_capacity';
  v_comp text := nullif(btrim(coalesce(m->>'company', '')), '');
  v_l1   text := nullif(btrim(coalesce(m->>'address_line1', '')), '');
  v_l2   text := nullif(btrim(coalesce(m->>'address_line2', '')), '');
  v_city text := nullif(btrim(coalesce(m->>'city', '')), '');
  v_pc   text := nullif(btrim(coalesce(m->>'postal_code', '')), '');
  v_ctry text := nullif(btrim(coalesce(m->>'country', '')), '');
  v_ver  text := coalesce(nullif(m->>'terms_version', ''), 'unrecorded');
  v_lang text := public.norm_lang(m->>'terms_language');
  v_sha  text;
  v_signed boolean;
begin
  -- Is this the very first account on an empty database?
  select not exists (select 1 from public.profiles) into v_bootstrap;

  if not v_bootstrap then
    -- Claim an invitation for this address, and consume it in the same
    -- breath. `for update skip locked` so two signups racing on one address
    -- cannot both claim the same row: the loser sees no row and is refused.
    update public.invitations i
       set used_at = now()
     where i.id = (
       select i2.id
         from public.invitations i2
        where lower(i2.email) = lower(new.email)
          and i2.used_at is null
          and i2.expires_at > now()
        order by i2.created_at
        limit 1
        for update skip locked
     )
    returning i.id into v_invitation_id;

    if v_invitation_id is null then
      -- Deliberately says nothing about WHY. "No invitation for this address"
      -- and "that invitation has expired" are both answers to the question
      -- "is this person a member here", which is the question this platform
      -- exists not to answer.
      raise exception 'Registration is by invitation only.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.profiles (user_id, first_name, last_name, company, email, phone, country, role, status, language,
                               address_line1, address_line2, city, postal_code, signing_capacity)
  values (
    new.id,
    coalesce(m->>'first_name', ''),
    coalesce(m->>'last_name', ''),
    m->>'company',
    lower(new.email),
    coalesce(m->>'phone', ''),
    coalesce(m->>'country', ''),
    'participant',   -- hardcoded, never taken from client input
    'pending',       -- hardcoded, never taken from client input
    public.norm_lang(m->>'language'),
    v_l1, v_l2, v_city, v_pc,
    case when v_cap in ('individual','company') then v_cap end
  )
  returning id into v_profile_id;

  -- Now that the profile exists, record who used the invitation. Done here
  -- rather than in the UPDATE above because used_by references profiles(id),
  -- which did not exist yet when the invitation was claimed.
  if v_invitation_id is not null then
    update public.invitations
       set used_by = v_profile_id
     where id = v_invitation_id;
  end if;

  select sha256 into v_sha from public.terms_versions
   where version = v_ver and language = v_lang;

  -- A signature counts only if it is complete and valid by the same rules as
  -- accept_terms(), and only against a version this platform published.
  v_signed := v_sha is not null
          and length(v_name) >= 3 and position(' ' in v_name) > 0
          and v_cap in ('individual','company')
          and (v_cap = 'individual' or v_comp is not null)
          and v_l1 is not null and v_city is not null and v_ctry is not null
          and not public.looks_like_po_box(v_l1)
          and not public.looks_like_po_box(v_l2);

  -- 'unrecorded' rather than skipping the insert: a missing row is ambiguous
  -- (did they not accept, or did the record fail?), whereas a row saying
  -- 'unrecorded' is unambiguous evidence that a registration arrived without a
  -- version attached, and an Operator can see it.
  insert into public.terms_acceptances
    (profile_id, version, language, signed_name, signed_capacity, signed_details, terms_sha256)
  values (
    v_profile_id, v_ver, v_lang,
    case when v_signed then v_name end,
    case when v_signed then v_cap end,
    case when v_signed then jsonb_build_object(
      'first_name', coalesce(m->>'first_name', ''), 'last_name', coalesce(m->>'last_name', ''),
      'email', lower(new.email), 'phone', coalesce(m->>'phone', ''),
      'company', case when v_cap = 'company' then v_comp end,
      'address_line1', v_l1, 'address_line2', v_l2,
      'city', v_city, 'postal_code', v_pc, 'country', v_ctry) end,
    case when v_signed then v_sha end
  );

  perform public.log_activity(
    v_profile_id,
    'user_registered',
    jsonb_build_object('email', lower(new.email))
  );

  return new;
end;
$function$;

commit;
