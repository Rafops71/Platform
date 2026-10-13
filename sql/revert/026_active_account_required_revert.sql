-- The way back from sql/026_active_account_required.sql.
--
-- These three functions exactly as they were on the live project before 026,
-- read out with pg_get_functiondef() on 2026-10-13 rather than reconstructed
-- from the repository or from memory.
--
-- Running this file lets somebody you have already suspended keep their
-- listings looking fresh, draw reference numbers, and - if they are an
-- Operator - delete audit rows. Those are the holes 026 closes. This file is
-- for an emergency, not a convenience.

CREATE OR REPLACE FUNCTION public.renew_listing(p_listing_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile_id uuid := public.current_profile_id();
  v_updated timestamptz;
begin
  if v_profile_id is null then
    raise exception 'No profile for the current session';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.next_reference(p_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  return v_prefix || '-' || v_year || '-' ||
         case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;
end;
$function$;

-- Note: this reverts purge_orphaned_activity() to its PRE-026 shape, which is
-- also pre-027 - it has no test-mail branch. Reverting 027 alone is not
-- possible from here; apply 026 and 027 again to go forward.
CREATE OR REPLACE FUNCTION public.purge_orphaned_activity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activity integer;
  v_notifications integer;
  v_total integer;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

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
$function$;
