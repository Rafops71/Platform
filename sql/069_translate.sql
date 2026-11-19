-- 069: Translate (owner, 19 Nov 2026; docs/AGREED-2026-11-19-translate.md, plan docs/PLAN-translate-2026-11-19.md).
-- applied-probe: select to_regclass('public.listing_translations') is not null and to_regclass('public.member_translate_usage') is not null and to_regclass('public.translate_daily_budget') is not null and to_regprocedure('public.get_listing_texts(uuid)') is not null and to_regprocedure('public.translate_take_member_slot(uuid,integer)') is not null and to_regprocedure('public.translate_reserve_budget(text,numeric,numeric)') is not null
--
-- WHAT IT ADDS (additive only: nothing is changed or removed, no existing row is touched):
--   1. get_listing_texts(listing_id): the three free-text fields of ONE listing (specification, price_conditions,
--      notes), for a signed-in caller with exactly the gates of get_public_listings() (sql/064): an approved
--      profile, and for a member (not an Operator) the current Terms signed; an archived listing is hidden
--      unless it is the caller's own. Members cannot select other members' listings directly (listings_select is
--      owner-or-Operator), so the translate-listing Edge Function reads the text through this, with the caller's
--      own token, and the database - not TypeScript - decides who may read what.
--   2. listing_translations: ONE cached translation per listing, field and language, with a hash of the source
--      text it translated (an edit changes the hash, so a stale translation is never served). Deleted with the
--      listing (on delete cascade). Row-level security on, NO policy and no grant to anon or authenticated: only
--      the Edge Function (service role) touches it, and only after get_listing_texts has passed.
--   3. member_translate_usage: a COUNT per member per hour (the owner's limit: 30 listings per member per hour).
--      It holds no listing id: nothing records which member looked at which listing. Old rows are swept by the
--      functions below.
--   4. translate_daily_budget: units used per UTC day, split into members and Operator (the owner reserves 6,000 of
--      Cloudflare's 10,000 free daily units for members; the Operator's message translation gets the rest).
--   5. Four functions only the service role may call: translate_take_member_slot / translate_release_member_slot
--      (the hourly count, atomic) and translate_reserve_budget / translate_release_budget (the daily units, atomic).
-- Nothing about messages is stored: the Operator's message translation has no table at all.
--
-- Revert: sql/revert/069_translate_revert.sql (drops the five new objects; the cache, counts and budget are
-- derived and disposable, so nothing of a member's is lost). Proof: sql/tests/40_translate.sql.

begin;

-- ---------------------------------------------------------------- 1. the read gate
create or replace function public.get_listing_texts(p_listing_id uuid)
returns table (specification text, price_conditions text, notes text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.profiles p
        where p.user_id = auth.uid() and p.status = 'approved'
     ) then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

  if not public.is_operator() and not public.has_accepted_current_terms() then
    raise exception 'Please sign the updated Terms & Conditions before continuing.'
      using errcode = '42501';
  end if;

  return query
    select l.specification, l.price_conditions, l.notes
      from public.listings l
     where l.id = p_listing_id
       and (l.status <> 'archived' or l.user_id = public.current_profile_id());
end;
$function$;

revoke execute on function public.get_listing_texts(uuid) from public, anon;
grant  execute on function public.get_listing_texts(uuid) to authenticated;

-- ---------------------------------------------------------------- 2. the cache
create table if not exists public.listing_translations (
  listing_id      uuid not null references public.listings(id) on delete cascade,
  field           text not null check (field in ('specification', 'price_conditions', 'notes')),
  target_lang     text not null check (target_lang in ('en', 'es')),
  source_hash     text not null,
  translated_text text not null,
  created_at      timestamptz not null default now(),
  primary key (listing_id, field, target_lang)
);
alter table public.listing_translations enable row level security;
revoke all on public.listing_translations from public, anon, authenticated;
grant select, insert, update, delete on public.listing_translations to service_role;

-- ---------------------------------------------------------------- 3. the hourly count
create table if not exists public.member_translate_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hour_start timestamptz not null,
  listings   integer not null default 0 check (listings >= 0),
  primary key (profile_id, hour_start)
);
alter table public.member_translate_usage enable row level security;
revoke all on public.member_translate_usage from public, anon, authenticated;
grant select, insert, update, delete on public.member_translate_usage to service_role;

-- ---------------------------------------------------------------- 4. the daily units
create table if not exists public.translate_daily_budget (
  day            date primary key,
  member_units   numeric not null default 0 check (member_units >= 0),
  operator_units numeric not null default 0 check (operator_units >= 0)
);
alter table public.translate_daily_budget enable row level security;
revoke all on public.translate_daily_budget from public, anon, authenticated;
grant select, insert, update, delete on public.translate_daily_budget to service_role;

-- ---------------------------------------------------------------- 5. the counters
-- True and one slot taken, or false and nothing changed. One statement decides, so two presses at once cannot
-- both slip under the limit.
create or replace function public.translate_take_member_slot(p_profile uuid, p_limit integer default 30)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hour timestamptz := date_trunc('hour', now());
begin
  delete from public.member_translate_usage where hour_start < now() - interval '1 day';
  insert into public.member_translate_usage (profile_id, hour_start, listings)
    values (p_profile, v_hour, 0)
    on conflict (profile_id, hour_start) do nothing;
  update public.member_translate_usage
     set listings = listings + 1
   where profile_id = p_profile and hour_start = v_hour and listings < p_limit;
  return found;
end;
$function$;

create or replace function public.translate_release_member_slot(p_profile uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.member_translate_usage
     set listings = greatest(listings - 1, 0)
   where profile_id = p_profile and hour_start = date_trunc('hour', now());
$$;

-- p_kind is 'member' or 'operator'. True and the units added, or false and nothing changed (the day's total for
-- that kind would pass p_cap). The day is the UTC day, when Cloudflare's own allowance resets.
create or replace function public.translate_reserve_budget(p_kind text, p_units numeric, p_cap numeric)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_kind not in ('member', 'operator') or p_units is null or p_units < 0 then
    raise exception 'translate_reserve_budget: unknown kind or negative units' using errcode = '22023';
  end if;
  delete from public.translate_daily_budget where day < v_day - 7;
  insert into public.translate_daily_budget (day) values (v_day) on conflict (day) do nothing;
  if p_kind = 'member' then
    update public.translate_daily_budget set member_units = member_units + p_units
     where day = v_day and member_units + p_units <= p_cap;
  else
    update public.translate_daily_budget set operator_units = operator_units + p_units
     where day = v_day and operator_units + p_units <= p_cap;
  end if;
  return found;
end;
$function$;

create or replace function public.translate_release_budget(p_kind text, p_units numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_kind = 'member' then
    update public.translate_daily_budget set member_units = greatest(member_units - p_units, 0) where day = v_day;
  elsif p_kind = 'operator' then
    update public.translate_daily_budget set operator_units = greatest(operator_units - p_units, 0) where day = v_day;
  end if;
end;
$function$;

revoke all on function public.translate_take_member_slot(uuid, integer)       from public, anon, authenticated;
revoke all on function public.translate_release_member_slot(uuid)             from public, anon, authenticated;
revoke all on function public.translate_reserve_budget(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.translate_release_budget(text, numeric)         from public, anon, authenticated;
grant execute on function public.translate_take_member_slot(uuid, integer)       to service_role;
grant execute on function public.translate_release_member_slot(uuid)             to service_role;
grant execute on function public.translate_reserve_budget(text, numeric, numeric) to service_role;
grant execute on function public.translate_release_budget(text, numeric)         to service_role;

commit;
