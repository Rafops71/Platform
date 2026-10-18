-- 029: get_public_listings() must not refuse a caller with no identity either.
--
-- THE SAME MISTAKE AS 028, IN THE FUNCTION NEXT DOOR
--
-- 028 fixed next_reference(). It did not fix this, because the eight failing
-- tests all pointed at next_reference and I fixed what the evidence pointed
-- at without asking whether 026 had made the same error twice. It had. Two
-- tests kept failing, and the second round of diagnosis cost another CI run.
--
-- The lesson is worth more than the patch: when a mistake comes from a
-- pattern, look for every place the pattern was applied. sql/025 and sql/026
-- added the same guard to four functions on the same day. Checked just now,
-- function by function:
--
--   get_public_listings()      guards on auth.uid()        -> fixed here
--   next_reference()           guards on auth.uid()        -> fixed in 028
--   renew_listing()            guards on current_profile_id(), and already
--                              raised "No profile for the current session"
--                              before 026 existed, so a null identity was
--                              never newly refused by it        -> untouched
--   purge_orphaned_activity()  reached only from the Operator console
--                              (js/operator.js:1311), always an authenticated
--                              operator                         -> untouched
--
-- WHY A NULL IDENTITY IS SAFE HERE
--
-- Read off pg_roles on the live project on 2026-10-18, not assumed: `anon`
-- holds no EXECUTE on this function. Only `authenticated` and `service_role`
-- do. A signed-out browser uses the anon role and is refused by the GRANT,
-- before this body runs at all. So a caller with auth.uid() = NULL is the
-- server: a script, a migration, or the test suite reading the function's own
-- column list to prove it exposes no identity - which is exactly what
-- full-flow.spec.js:221 and mailbox-flow.spec.js:126 do.
--
-- WHAT IS STILL REFUSED, AND STILL PROVEN
--
-- The whole of item 59. A member with a live token whose profile is
-- suspended, pending, rejected or deleted has a non-null auth.uid(), finds no
-- approved row, and is refused. sql/tests/17 T2, T3, T4 assert exactly that
-- and are untouched by this. T5 asserted that a caller with NO identity is
-- refused; that assertion was wrong for the same reason 026 was, and it is
-- replaced rather than deleted - by one that asserts the server is let
-- through AND that the absence of an anon grant is what keeps the door shut.

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
  -- From 025, corrected by 029: a caller who HAS an identity must be an
  -- approved member. A null identity is the server, which anon cannot be.
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
