-- 043: a principal posting a SELL offer says whether they are a producer or a
-- trader (owner's ask, 2026-10-29). Nothing on Buy requests. Adds one column
-- and one check; existing offers keep "no answer" until they are next edited.
-- The server asks again (the form asks first), like every statement in 033.
-- Revert: sql/revert/043_principal_kind_revert.sql
begin;

alter table public.listings add column if not exists principal_kind text;
do $$ begin
  alter table public.listings add constraint listings_principal_kind_check
    check (principal_kind is null or principal_kind in ('producer','trader'));
exception when duplicate_object then null; end $$;

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
      new.truth_confirmed_at := old.truth_confirmed_at;
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
    raise exception 'Jericho accepts offers no more than two steps from the principal. Please post only offers within that distance.'
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

  if new.docs_seen is null or new.docs_showable is null then
    raise exception 'Please answer both questions about documents.' using errcode = '22023';
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

drop function if exists public.get_public_listings();
create or replace function public.get_public_listings()
returns table(id uuid, reference_number text, type text, commodity text,
              quantity numeric, unit text, incoterm text, region text,
              specification text, price_conditions text, price_unit text,
              currency text, notes text, status text, has_documents boolean,
              created_at timestamp with time zone,
              updated_at timestamp with time zone,
              poster_role text, docs_seen text, principal_kind text)
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
      l.poster_role, l.docs_seen, l.principal_kind
    from public.listings l
    where l.status <> 'archived';
end;
$function$;

revoke execute on function public.get_public_listings() from public, anon;
grant  execute on function public.get_public_listings() to authenticated, service_role;

commit;
