-- 064: dated statements (owner's decision 2026-11-16, "Idea 1", Option A).
-- Browse shows "Stated by the poster on <date>", and after 30 days "Not re-confirmed since
-- <date>"; the poster's "Yes, still available" also re-confirms, i.e. stamps today as that date.
-- NO new column: the date is listings.truth_confirmed_at, which the server already stamps
-- whenever the poster saves a changed listing with the truth tick (sql/033).
--
-- WHAT IT CHANGES (three functions, each re-created with an IDENTICAL body except as noted;
-- triggers, owners, security settings, search_paths and grants are kept):
--   1. get_public_listings(): returns one more column, truth_confirmed_at (the date only; the
--      truth tick itself is not exposed). Dropped and re-created because the return type
--      changes; execute rights are put back exactly as sql/043 had them.
--   2. renew_listing(): raises a transaction-local flag naming the listing for the duration of
--      its own update. Everything else (ownership, active-account check, log line) is as 026.
--   3. enforce_listing_statements(): body as sql/063, except that on an update where no
--      statement changed, if the flag names this listing AND the listing already has a date,
--      the date becomes now() instead of being copied back. The browser still cannot set the
--      date: every other path copies the old value or uses the server's clock, as before.
-- No data is read, written or deleted. Idempotent. Nothing a member could do before is refused.
-- Revert: sql/revert/064_dated_statements_revert.sql. Proof: sql/tests/35_dated_statements.sql.

begin;

create or replace function public.enforce_listing_statements()
returns trigger
language plpgsql
-- DEFINER because it reads auth.uid(), and a member's own role has no access
-- to the auth schema. It decides nothing from current_user.
security definer
set search_path to 'public'
as $function$
declare
  v_changed boolean;
begin
  -- Not a member: an Operator, or the server itself. See the header.
  if auth.uid() is null or public.is_operator() then
    if tg_op = 'UPDATE' then new.truth_confirmed_at := old.truth_confirmed_at; end if;
    new.truth_confirmed := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_changed := (new.type, new.commodity, new.quantity, new.unit, new.specification,
                  new.incoterm, new.origin, new.destination, new.price_conditions,
                  new.price_unit, new.currency, new.notes,
                  new.poster_role, new.principal_kind, new.has_mandate, new.mandate_date, new.broker_via,
                  new.docs_seen, new.docs_showable)
       is distinct from
                 (old.type, old.commodity, old.quantity, old.unit, old.specification,
                  old.incoterm, old.origin, old.destination, old.price_conditions,
                  old.price_unit, old.currency, old.notes,
                  old.poster_role, old.principal_kind, old.has_mandate, old.mandate_date, old.broker_via,
                  old.docs_seen, old.docs_showable);
    if not v_changed then
      -- Added by 064: "Yes, still available" (renew_listing) re-confirms the poster's statements.
      -- renew_listing names this listing in a flag that lasts only for its own transaction; a
      -- browser cannot set it. Only a listing that already has a date is re-dated: a listing from
      -- before sql/033 has no statements, and renewing it never claims any.
      if old.truth_confirmed_at is not null
         and current_setting('myplatform.reconfirm_listing', true) = old.id::text then
        new.truth_confirmed_at := now();
      else
        new.truth_confirmed_at := old.truth_confirmed_at;
      end if;
      new.truth_confirmed := false;
      return new;
    end if;
  end if;

  -- The two-degrees rule comes first: it is the one a poster most needs to
  -- read in full, and the only refusal written in the owner's own words.
  if new.poster_role = 'broker'
     and new.broker_via is distinct from 'principal'
     and new.broker_via is distinct from 'mandate_holder'
     and new.broker_via is distinct from 'one_broker' then
    raise exception 'MyPlatform accepts offers no more than two steps from the principal. Please post only offers within that distance.'
      using errcode = '22023';
  end if;

  if new.poster_role is null then
    raise exception 'Please say what your role is in this offer.' using errcode = '22023';
  end if;

  if new.poster_role = 'mandated' then
    if new.has_mandate is distinct from true then
      raise exception 'Without a signed mandate you act as a broker. Please choose Broker as your role.'
        using errcode = '22023';
    end if;
    if new.mandate_date is null or new.mandate_date > current_date then
      raise exception 'Please give the date your mandate was signed.' using errcode = '22023';
    end if;
    new.broker_via := null;
  elsif new.poster_role = 'broker' then
    new.has_mandate := null;
    new.mandate_date := null;
  else
    new.has_mandate := null;
    new.mandate_date := null;
    new.broker_via := null;
  end if;

  -- Producer or Trader: asked of a principal on a Sell offer, and only there.
  if new.poster_role = 'principal' and new.type = 'sell' then
    if new.principal_kind is null then
      raise exception 'Please say whether you are a producer or a trader.' using errcode = '22023';
    end if;
  else
    new.principal_kind := null;
  end if;

  -- Documents (owner's decisions F2 and F3, 2026-11-15): only a Sell offer is asked
  -- whether the poster has seen documents; a Buy request is asked nothing about
  -- documents; "can documents be shown" is no longer asked of anyone. Nothing is
  -- cleared here: an answer already stored on an older listing stays as it is.
  if new.type = 'sell' and new.docs_seen is null then
    raise exception 'Please answer the question about documents.' using errcode = '22023';
  end if;

  if new.truth_confirmed is distinct from true then
    raise exception 'Please confirm that this offer is true before publishing it.' using errcode = '22023';
  end if;

  -- The server's clock, never the browser's.
  new.truth_confirmed_at := now();
  new.truth_confirmed := false;
  return new;
end;
$function$;

create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_updated timestamptz;
begin
  if v_profile_id is null then
    raise exception 'No profile for the current session';
  end if;

  -- Added by 026. A suspended member could otherwise keep their listings
  -- looking fresh indefinitely.
  if not exists (select 1 from public.profiles p
                  where p.id = v_profile_id and p.status = 'approved') then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

  -- Ownership is checked here rather than left to RLS, because this is a
  -- definer function and RLS does not stand behind it. An unowned id must not
  -- silently renew somebody else's listing, and must not quietly do nothing
  -- either: the caller is told.
  -- Added by 064: the flag tells enforce_listing_statements that this update is the poster
  -- re-confirming their statements. It lasts for this transaction only and is cleared below.
  perform set_config('myplatform.reconfirm_listing', p_listing_id::text, true);

  update public.listings
     set updated_at = now()
   where id = p_listing_id
     and user_id = v_profile_id
  returning updated_at into v_updated;

  perform set_config('myplatform.reconfirm_listing', '', true);

  if v_updated is null then
    raise exception 'Listing not found, or not yours';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile_id, 'listing_renewed',
            jsonb_build_object('listing_id', p_listing_id));

  return v_updated;
end;
$$;

drop function if exists public.get_public_listings();
create or replace function public.get_public_listings()
returns table(id uuid, reference_number text, type text, commodity text,
              quantity numeric, unit text, incoterm text, region text,
              specification text, price_conditions text, price_unit text,
              currency text, notes text, status text, has_documents boolean,
              created_at timestamp with time zone,
              updated_at timestamp with time zone,
              poster_role text, docs_seen text, principal_kind text,
              truth_confirmed_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null
     and not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.status = 'approved'
  ) then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

  if auth.uid() is not null
     and not public.is_operator()
     and not public.has_accepted_current_terms() then
    raise exception 'Please sign the updated Terms & Conditions before continuing.'
      using errcode = '42501';
  end if;

  return query
    select
      l.id, l.reference_number, l.type, l.commodity,
      l.quantity, l.unit, l.incoterm,
      case when l.type = 'sell' then l.origin else l.destination end as region,
      l.specification, l.price_conditions, l.price_unit,
      l.currency, l.notes,
      l.status,
      exists (
        select 1 from public.document_checklist dc
        where dc.listing_id = l.id and dc.indicated = true
      ) as has_documents,
      l.created_at, l.updated_at,
      l.poster_role, l.docs_seen, l.principal_kind,
      l.truth_confirmed_at
    from public.listings l
    where l.status <> 'archived';
end;
$function$;

revoke execute on function public.get_public_listings() from public, anon;
grant  execute on function public.get_public_listings() to authenticated, service_role;

commit;
