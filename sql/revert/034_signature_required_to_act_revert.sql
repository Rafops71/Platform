-- Revert 034. is_approved_participant() exactly as live before 034 (read with
-- pg_get_functiondef on 2026-10-25), and get_public_listings() as sql/033 left
-- it - without the signature check.
begin;

CREATE OR REPLACE FUNCTION public.is_approved_participant()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and status = 'approved'
  );
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
