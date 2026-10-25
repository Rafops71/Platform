-- Revert 033. Puts get_public_listings() back as sql/029 left it - the live
-- definition, checked by its md5 on 2026-10-25 (ee5a24b0958382cdf36f53ca659b1ce2)
-- - and removes the statement rules. The columns stay: dropping them would
-- destroy what members have already stated and when they confirmed it.

begin;

drop trigger if exists trg_enforce_listing_statements on public.listings;
drop function if exists public.enforce_listing_statements();

drop function if exists public.get_public_listings();
-- Copied from pg_get_functiondef on the live project, 2026-10-25.
CREATE OR REPLACE FUNCTION public.get_public_listings()
 RETURNS TABLE(id uuid, reference_number text, type text, commodity text, quantity numeric, unit text, incoterm text, region text, specification text, price_conditions text, price_unit text, currency text, notes text, status text, has_documents boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- From 025, corrected by 029: a caller who HAS an identity must be an
  -- approved member. A null identity is the server - anon holds no EXECUTE on
  -- this function, so a signed-out browser is stopped by the grant before
  -- this body runs. Read off pg_roles on 2026-10-18.
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
      l.created_at, l.updated_at
    from public.listings l
    where l.status <> 'archived';
end;
$function$;

revoke execute on function public.get_public_listings() from public, anon;
grant  execute on function public.get_public_listings() to authenticated, service_role;

commit;
