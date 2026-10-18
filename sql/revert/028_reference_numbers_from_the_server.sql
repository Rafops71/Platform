-- Revert 028: put next_reference() back to what 026 left behind.
--
-- Read off the live database with pg_get_functiondef() on 2026-10-18 BEFORE
-- 028 was applied, not reconstructed from the migration that was supposed to
-- have produced it. Those two are not the same thing and only one of them is
-- evidence.
--
-- Applying this restores the bug: the service role, the test fixtures and any
-- server-side script are refused with "Your account is not active on this
-- platform." Eight browser tests fail. That is the state this reverts TO, and
-- it is written down so nobody has to rediscover it.

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
  -- Added by 026.
  if not exists (select 1 from public.profiles p
                  where p.user_id = auth.uid() and p.status = 'approved') then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

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

  return v_prefix || '-' || v_year || '-' ||
         case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
end;
$function$;
