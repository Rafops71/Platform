-- Revert 060: the listing-statements error says "Jericho" again, exactly as sql/043
-- left the function. Only that one function is re-created; nothing else is touched.

begin;

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

commit;
