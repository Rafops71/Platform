-- The way back from sql/025_browse_requires_approval.sql.
--
-- This is get_public_listings() exactly as it was on the live project before
-- 025 replaced it, read out with pg_get_functiondef() on 2026-10-13 rather
-- than reconstructed.
--
-- Running this file lets a SUSPENDED member browse the whole market again from
-- a tab that is still open. That is the hole 025 closes, so this is for an
-- emergency - Browse broken for everybody - and not a convenience.

CREATE OR REPLACE FUNCTION public.get_public_listings()
 RETURNS TABLE(id uuid, reference_number text, type text, commodity text, quantity numeric, unit text, incoterm text, region text, specification text, price_conditions text, price_unit text, currency text, notes text, status text, has_documents boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
