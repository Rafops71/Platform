-- 022_reference_number_overflow.sql
--
-- Fixes a bug that stops the platform dead at its 1000th sell listing.
--
-- next_reference() (sql/rls_policies.sql) ended with:
--
--     return v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');
--
-- PostgreSQL's lpad does not only pad. It TRUNCATES when the string is longer
-- than the requested length:
--
--     lpad('999',  3, '0')  ->  '999'
--     lpad('1000', 3, '0')  ->  '100'
--     lpad('1012', 3, '0')  ->  '101'
--     lpad('1013', 3, '0')  ->  '101'
--
-- listings.reference_number is UNIQUE. So from the 1000th sell listing of a
-- year onward, every reference collides with one already issued and the insert
-- is refused. Not degraded - refused. Nobody can post a listing again for the
-- rest of that year, and the message a member sees is a raw constraint error.
--
-- This was latent from the day the function was written. It surfaced on
-- 2026-10-12 because the volume tests had pushed SELL-26 past 1000 (it stood
-- at 1012), after which five browser tests failed with
-- "duplicate key value violates unique constraint listings_reference_number_key".
-- Nothing in the suites had ever issued a thousand references before, so
-- nothing had ever reached the cliff.
--
-- The fix is to pad short numbers and leave long ones alone, so the format is
-- unchanged below 1000 - SELL-26-001 stays SELL-26-001, and every reference
-- already issued and printed stays valid - and simply grows a digit above it:
-- SELL-26-1000. A wider pad would have been a worse fix: it would renumber
-- nothing, but it would still have a cliff, just further away.
--
-- The counter itself was always correct. Only its rendering was wrong.

begin;

create or replace function public.next_reference(p_type text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prefix text;
  v_year text := to_char(now(), 'YY');
  v_key text;
  v_seq integer;
begin
  if p_type = 'sell' then
    v_prefix := 'SELL';
  elsif p_type = 'buy' then
    v_prefix := 'BUY';
  else
    raise exception 'Unknown listing type: %', p_type;
  end if;
  v_key := v_prefix || '-' || v_year;

  insert into public.reference_counters (key, last_value)
    values (v_key, 1)
    on conflict (key) do update set last_value = public.reference_counters.last_value + 1
    returning last_value into v_seq;

  -- Pad to three digits, never truncate past them. lpad alone cannot express
  -- this: asking it for three characters of a four-character number throws the
  -- fourth away.
  return v_prefix || '-' || v_year || '-' ||
         case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
end;
$function$;

commit;
