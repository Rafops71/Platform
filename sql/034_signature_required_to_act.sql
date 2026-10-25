-- 034: an unsigned member is held by the database, not only by the page.
--
-- sql/031 put the sign-in gate in the interface and said plainly what it did
-- not do: "A member who bypasses the interface could still post before
-- re-signing." The second-opinion reviewer raised the same gap on PR #17.
-- This closes it.
--
-- WHAT CHANGES. is_approved_participant() - read off the live project on
-- 2026-10-25, and used by exactly two policies there, listings_insert and
-- messages_insert - now also requires a signature for the newest published
-- Terms. And Browse (get_public_listings) refuses a member who has not
-- signed, with words that say why.
--
-- Operators are not members and are not held: both places already let an
-- Operator through on is_operator(), and the Operators are the ones the
-- Terms are made with, not a party signing them.
--
-- With no version published, has_accepted_current_terms() is true, so this
-- can never lock everyone out ahead of the text it gates on.

begin;

create or replace function public.is_approved_participant()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and status = 'approved'
  )
  and public.has_accepted_current_terms();
$function$;

create or replace function public.get_public_listings()
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
      l.poster_role, l.docs_seen
    from public.listings l
    where l.status <> 'archived';
end;
$function$;

commit;
