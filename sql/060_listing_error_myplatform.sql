-- 060: the listing-statements error says "MyPlatform", not "Jericho" (owner's decision,
-- 2026-11-09: "Yes, change it"). This is the sentence a member sees if the form's own check
-- is bypassed and the database refuses an offer more than two steps from the principal.
-- The form already shows the same sentence, in English and Spanish, from js/i18n.js
-- ('stmt.err.tooFar'), so this makes the database's backstop say the same thing.
--
-- WHAT IT CHANGES: the one function public.enforce_listing_statements(), re-created
-- with CREATE OR REPLACE and an IDENTICAL body (copied from sql/043, its latest
-- definition) except for that one sentence. Its trigger, its owner, its security
-- setting, its search_path and its grants are kept (CREATE OR REPLACE keeps them).
-- No data is read or written. Idempotent: running it again changes nothing.
-- Revert: sql/revert/060_listing_error_myplatform_revert.sql (the function as 043 left it).
-- Proof: sql/tests/31_listing_error_myplatform.sql.

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
