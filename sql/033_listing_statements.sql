-- 033: what a poster says about their own listing - their role, how far they
-- are from the principal, what they know about documents - and that they
-- confirmed it was true.
--
-- Decided with the owner, 2026-10-25 (docs/AGREED-2026-10-25.md, items 16-22).
--
--   poster_role     principal | mandated | broker
--   has_mandate     mandated only: must be true. No signed mandate means the
--                   poster is a broker, and is told so.
--   mandate_date    mandated only: the date the mandate was signed.
--   broker_via      broker only: principal | mandate_holder | one_broker.
--                   Anything further away is refused in the owner's words -
--                   his two-degrees rule.
--   docs_seen       yes | source_says | no
--   docs_showable   on_request | after_agreement | no
--   truth_confirmed one-shot signal from the form's tick box; the server
--                   stamps truth_confirmed_at with ITS clock and clears the
--                   signal, so the next edit has to tick again.
--
-- WHO IS HELD TO IT. A member, i.e. a caller with an identity who is not an
-- Operator. Rows written with no identity - migrations, the test suites'
-- fixtures, scripts - are not member statements and are not invented ones
-- either: they stay blank, and Browse says "Not stated", exactly as for every
-- listing posted before this existed (decision 21: never a guess).
--
-- WHEN. Every member insert, and every member update that changes what the
-- listing says. A status-only update (closing a listing, renewing it) is not
-- a new statement and does not ask for one.

begin;

alter table public.listings add column if not exists poster_role text;
alter table public.listings add column if not exists has_mandate boolean;
alter table public.listings add column if not exists mandate_date date;
alter table public.listings add column if not exists broker_via text;
alter table public.listings add column if not exists docs_seen text;
alter table public.listings add column if not exists docs_showable text;
alter table public.listings add column if not exists truth_confirmed boolean not null default false;
alter table public.listings add column if not exists truth_confirmed_at timestamptz;

do $$ begin
  alter table public.listings add constraint listings_poster_role_check
    check (poster_role is null or poster_role in ('principal','mandated','broker'));
  alter table public.listings add constraint listings_broker_via_check
    check (broker_via is null or broker_via in ('principal','mandate_holder','one_broker'));
  alter table public.listings add constraint listings_docs_seen_check
    check (docs_seen is null or docs_seen in ('yes','source_says','no'));
  alter table public.listings add constraint listings_docs_showable_check
    check (docs_showable is null or docs_showable in ('on_request','after_agreement','no'));
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
                  new.poster_role, new.has_mandate, new.mandate_date, new.broker_via,
                  new.docs_seen, new.docs_showable)
       is distinct from
                 (old.type, old.commodity, old.quantity, old.unit, old.specification,
                  old.incoterm, old.origin, old.destination, old.price_conditions,
                  old.price_unit, old.currency, old.notes,
                  old.poster_role, old.has_mandate, old.mandate_date, old.broker_via,
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

drop trigger if exists trg_enforce_listing_statements on public.listings;
create trigger trg_enforce_listing_statements
  before insert or update on public.listings
  for each row execute function public.enforce_listing_statements();

revoke execute on function public.enforce_listing_statements() from public, anon;

-- ------------------------------------------------------------- Browse --
-- Decision 20: Browse shows the role and one line about documents. The
-- mandate and the chain are for the Operators' eyes only, so they are not in
-- this function's columns at all. The return type grows, which CREATE OR
-- REPLACE cannot do, hence the drop and the grants restated as 017 and 029
-- left them: authenticated and service_role, never anon.
drop function if exists public.get_public_listings();
create function public.get_public_listings()
returns table(id uuid, reference_number text, type text, commodity text,
              quantity numeric, unit text, incoterm text, region text,
              specification text, price_conditions text, price_unit text,
              currency text, notes text, status text, has_documents boolean,
              created_at timestamp with time zone,
              updated_at timestamp with time zone,
              poster_role text, docs_seen text)
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
      l.poster_role, l.docs_seen
    from public.listings l
    where l.status <> 'archived';
end;
$function$;

revoke execute on function public.get_public_listings() from public, anon;
grant  execute on function public.get_public_listings() to authenticated, service_role;

commit;
