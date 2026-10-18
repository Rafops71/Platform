-- Revert 029: put get_public_listings() back to what 025 left behind.
--
-- Read off the live database with pg_get_functiondef() on 2026-10-18 BEFORE
-- 029 was applied. Applying this restores the bug: the service role and the
-- test suite are refused with "Your account is not active on this platform.",
-- and full-flow.spec.js:221 and mailbox-flow.spec.js:126 fail.

create or replace function public.get_public_listings()
returns table(id uuid, reference_number text, type text, commodity text,
              quantity numeric, unit text, incoterm text, region text,
              specification text, price_conditions text, price_unit text,
              currency text, notes text, status text, has_documents boolean,
              created_at timestamp with time zone,
              updated_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
$function$;
