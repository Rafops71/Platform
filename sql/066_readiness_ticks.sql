-- 066: readiness ticks (owner's decision 2026-11-16; checklist Item 66, statements on a listing).
-- A principal may tick what is ready: a seller one or two of four sentences (Producer: own
-- production available / on a production schedule; Trader: ex-stock title held / back-to-back
-- supply contract), a buyer one ("prepared to proceed ..."). Optional: no tick states nothing.
-- Visible to the Operator ONLY: the column is read through the existing owner-or-Operator
-- listing policy, and get_public_listings() (Browse) is NOT changed and does not name it.
--
-- WHAT IT CHANGES
--   1. listings.readiness text[] (new, nullable, additive) with a check that every element is one
--      of: own_available, own_scheduled, ex_stock, back_to_back, buy_ready.
--   2. enforce_listing_statements(): body as sql/064, plus (a) readiness counts as a statement, so
--      changing a tick re-dates truth_confirmed_at, the one date shown with the statements (no new
--      date), (b) readiness is kept only from a Principal and only the ticks that fit the offer
--      type and Producer/Trader, otherwise dropped, (c) an Operator or server update leaves it
--      as it was. Trigger, owner, security setting, search_path and grants are kept.
-- Existing rows get NULL (nothing stated). No data is deleted or changed. Idempotent.
-- Revert: sql/revert/066_readiness_ticks_revert.sql. Proof: sql/tests/37_readiness_ticks.sql.

begin;

alter table public.listings add column if not exists readiness text[];
do $$ begin
  alter table public.listings add constraint listings_readiness_check
    check (readiness is null or readiness <@ array['own_available','own_scheduled','ex_stock','back_to_back','buy_ready']::text[]);
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
  v_allowed text[];
begin
  -- Not a member: an Operator, or the server itself. See the header.
  if auth.uid() is null or public.is_operator() then
    if tg_op = 'UPDATE' then
      new.truth_confirmed_at := old.truth_confirmed_at;
      new.readiness := old.readiness;
    end if;
    new.truth_confirmed := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_changed := (new.type, new.commodity, new.quantity, new.unit, new.specification,
                  new.incoterm, new.origin, new.destination, new.price_conditions,
                  new.price_unit, new.currency, new.notes,
                  new.poster_role, new.principal_kind, new.has_mandate, new.mandate_date, new.broker_via,
                  new.docs_seen, new.docs_showable, new.readiness)
       is distinct from
                 (old.type, old.commodity, old.quantity, old.unit, old.specification,
                  old.incoterm, old.origin, old.destination, old.price_conditions,
                  old.price_unit, old.currency, old.notes,
                  old.poster_role, old.principal_kind, old.has_mandate, old.mandate_date, old.broker_via,
                  old.docs_seen, old.docs_showable, old.readiness);
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

  -- Readiness ticks (066). Optional; seen by the Operator only. Kept only from a Principal, and
  -- only the ticks that belong to the offer type and, on a Sell offer, to Producer or Trader.
  -- Anything else is dropped, so a changed role leaves no stale tick behind. An empty set is NULL.
  if new.poster_role = 'principal' then
    if new.type = 'buy' then
      v_allowed := array['buy_ready'];
    elsif new.principal_kind = 'producer' then
      v_allowed := array['own_available','own_scheduled'];
    else
      v_allowed := array['ex_stock','back_to_back'];
    end if;
    new.readiness := (select array_agg(distinct x order by x)
                        from unnest(new.readiness) as x where x = any(v_allowed));
  else
    new.readiness := null;
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

commit;
