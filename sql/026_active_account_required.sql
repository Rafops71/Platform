-- The rest of the doors that only asked WHO, never WHETHER.
--
-- sql/025 closed get_public_listings(). This closes the others found in the
-- same sweep of every SECURITY DEFINER function on the live project. Those
-- functions run with the owner's rights, so Row Level Security does not stand
-- behind them: whatever they choose to check is the whole of the check.
--
-- Read off the live catalog on 2026-10-13, every function a member can call:
--
--   renew_listing            owner checked, status never
--   next_reference           nothing checked at all
--   purge_orphaned_activity  role = 'operator' checked, status never
--
-- What each one allowed somebody you had already thrown out:
--
--   renew_listing   keep their own listings looking fresh for ever, so a
--                   suspended member stays at the top of an Operator's screen
--                   and never shows up as stale.
--   next_reference  burn reference numbers at will. Harmless to data, but it
--                   is a counter a stranger should not be able to turn.
--   purge           a SUSPENDED OPERATOR could still delete audit rows. Of
--                   the three this is the one that matters: the audit trail is
--                   the thing you reach for when you are trying to work out
--                   what somebody did before you suspended them.
--
-- An approved Operator is unaffected by all three.

-- ------------------------------------------------------------ renew_listing --

create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_updated timestamptz;
begin
  if v_profile_id is null then
    raise exception 'No profile for the current session';
  end if;

  -- Added by 026. A suspended member could otherwise keep their listings
  -- looking fresh indefinitely.
  if not exists (select 1 from public.profiles p
                  where p.id = v_profile_id and p.status = 'approved') then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

  -- Ownership is checked here rather than left to RLS, because this is a
  -- definer function and RLS does not stand behind it. An unowned id must not
  -- silently renew somebody else's listing, and must not quietly do nothing
  -- either: the caller is told.
  update public.listings
     set updated_at = now()
   where id = p_listing_id
     and user_id = v_profile_id
  returning updated_at into v_updated;

  if v_updated is null then
    raise exception 'Listing not found, or not yours';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile_id, 'listing_renewed',
            jsonb_build_object('listing_id', p_listing_id));

  return v_updated;
end;
$$;

-- ----------------------------------------------------------- next_reference --

create or replace function public.next_reference(p_type text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Pad to three digits, never truncate past them. lpad alone cannot express
  -- this: asking it for three characters of a four-character number throws the
  -- fourth away.
  return v_prefix || '-' || v_year || '-' ||
         case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
end;
$$;

-- -------------------------------------------------- purge_orphaned_activity --

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_activity integer;
  v_notifications integer;
  v_total integer;
begin
  -- 026 adds `and p.status = 'approved'`. The role alone was not enough: a
  -- suspended Operator could still delete audit rows, which are exactly what
  -- you read when working out what somebody did before you suspended them.
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator'
                    and p.status = 'approved') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

  -- 1. The audit trail. Unchanged from 021.
  delete from public.activity_log a
   where a.user_id is null
     and (
       (jsonb_exists(a.details, 'profile_id')
         and not exists (select 1 from public.profiles p
                          where p.id = (a.details->>'profile_id')::uuid))
       or
       (jsonb_exists(a.details, 'listing_id')
         and not exists (select 1 from public.listings l
                          where l.id = (a.details->>'listing_id')::uuid))
     );
  get diagnostics v_activity = row_count;

  -- 2. The Operator feed. related_id is a listing, a profile or a message
  --    depending on the notification's type, and the type names are not worth
  --    trusting for this - a row whose target is absent from ALL THREE is
  --    about something that no longer exists, whichever it was.
  --
  --    A null related_id is left alone: it points at nothing by design rather
  --    than by deletion, so "the thing it names is gone" does not apply.
  delete from public.notifications n
   where n.related_id is not null
     and not exists (select 1 from public.listings l where l.id = n.related_id)
     and not exists (select 1 from public.profiles p where p.id = n.related_id)
     and not exists (select 1 from public.messages m where m.id = n.related_id);
  get diagnostics v_notifications = row_count;

  v_total := v_activity + v_notifications;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_total,
                               'activity_log', v_activity,
                               'notifications', v_notifications));

  return v_total;
end;
$$;
