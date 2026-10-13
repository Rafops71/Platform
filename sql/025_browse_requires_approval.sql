-- Suspending somebody has to actually put them out.
--
-- WHAT WAS WRONG
--
-- Browse does not read the listings table - Row Level Security there allows a
-- member only their own rows. It calls get_public_listings(), which is
-- SECURITY DEFINER and therefore runs with the owner's rights, bypassing RLS
-- on purpose so that a member can see other people's offers without seeing who
-- posted them.
--
-- It asked who was calling, but never whether they were still allowed in.
--
-- Proven on the live project on 2026-10-13 with a throwaway account, created
-- and deleted inside the same check:
--
--   APPROVED  -> listings visible: 1
--   (operator suspends the account)
--   SUSPENDED -> listings visible: 1      <- the hole
--   SUSPENDED -> posting a listing: 403   <- correctly refused
--
-- So writing was already closed and reading was not. An access token lives for
-- about an hour after it is issued, and the browser holds it: a member
-- suspended at nine o'clock could carry on reading the entire market from an
-- open tab. The interface sends them to the sign-in page, but the interface is
-- not the lock - anybody can skip the interface.
--
-- For a platform whose product is controlled disclosure, "we removed them and
-- they kept reading" is the kind of sentence that ends a client relationship.
--
-- WHAT THIS DOES
--
-- Refuses anybody whose profile is not approved. An Operator is approved by
-- definition of is_operator(), so this does not change what an Operator sees.
-- It raises rather than returning nothing, because an empty market and a
-- closed door should not look the same to the person who was shut out.

create or replace function public.get_public_listings()
returns table (
  id uuid, reference_number text, type text, commodity text, quantity numeric,
  unit text, incoterm text, region text, specification text,
  price_conditions text, price_unit text, currency text, notes text,
  status text, has_documents boolean,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not exists (
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
      l.created_at, l.updated_at
    from public.listings l
    where l.status <> 'archived';
end;
$$;
