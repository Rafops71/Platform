-- 028: next_reference() must not refuse a caller with no identity at all.
--
-- WHAT BROKE
--
-- sql/026 closed a real hole: a SUSPENDED member could still draw a reference
-- number, which is how they would keep posting after being shown the door. The
-- guard it added asks:
--
--     where p.user_id = auth.uid() and p.status = 'approved'
--
-- and raises if no such row exists. But when the caller is the SERVICE ROLE -
-- a server-side script, a migration, the test fixtures - auth.uid() is NULL,
-- so no row matches, so the guard raises. 026 therefore refused the one class
-- of caller it was never aimed at.
--
-- The cost was eight browser tests and a red CI on main from 2026-10-13 to
-- 2026-10-18, because the fixtures build their listings with
-- `public.next_reference('sell')` in SQL. Five days red, unnoticed, which is
-- its own lesson: a green film and a red gate are not the same thing.
--
-- WHY ALLOWING A NULL IDENTITY IS SAFE HERE
--
-- Checked against the live catalog on 2026-10-18 rather than assumed: `anon`
-- has NO execute privilege on this function. Only `authenticated` and
-- `service_role` do.
--
--     select rolname from pg_roles
--      where has_function_privilege(rolname, 'public.next_reference(text)', 'EXECUTE');
--     -> authenticated, service_role  (and the owner)
--
-- So a caller with auth.uid() = NULL is NEVER an anonymous web visitor; it
-- cannot be, because an anonymous visitor cannot reach the function at all. It
-- is the trusted server. Refusing it protects nothing and breaks real work.
--
-- WHAT IS STILL REFUSED
--
-- Everything 026 was for. A member with a live token whose profile is
-- suspended, pending, rejected or deleted has a NON-NULL auth.uid(), finds no
-- approved row, and is refused exactly as before. That is the case that
-- mattered and it is untouched - sql/tests/17 asserts it, and now also asserts
-- that the server side is let through, so this cannot be silently undone.

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
  -- From 026, corrected by 028: the guard applies to a caller who HAS an
  -- identity. A null identity is the service role, which anon cannot reach.
  if auth.uid() is not null
     and not exists (select 1 from public.profiles p
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

  -- Pad to three digits, never truncate past them. lpad alone cannot express
  -- this: asking it for three characters of a four-character number throws the
  -- fourth away.
  return v_prefix || '-' || v_year || '-' ||
         case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
end;
$function$;
