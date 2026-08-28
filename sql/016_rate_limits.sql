-- 016_rate_limits.sql
--
-- Flood protection for the two things a participant can create without an
-- Operator in the loop: messages and listings.
--
-- WHY IN THE DATABASE, NOT THE UI
--
-- A limit enforced in js/app.js is a suggestion. The publishable key and the
-- REST endpoint are both public — anyone with a browser console can insert
-- straight into PostgREST, and an approved participant already has a valid
-- session to do it with. RLS decides *whether* they may insert; nothing so far
-- decided *how often*. A BEFORE INSERT trigger is the only place the answer
-- holds for every caller.
--
-- WHAT THIS DOES NOT PROTECT AGAINST
--
-- Sign-in brute force, signup floods and password-reset abuse all happen at
-- the Auth endpoints, before a row is ever inserted, so no trigger here can
-- see them. Those are Supabase dashboard settings — see docs/RATE_LIMITING.md.
--
-- THE LIMITS
--
-- Deliberately generous. These are flood stops, not quotas: a participant
-- hitting one is doing something no legitimate workflow does. Set too tight,
-- they would silently break honest use, which is worse than the abuse.
--
--   messages: 30 per hour per sender
--   listings: 20 per hour per owner
--
-- Operators are exempt. An Operator legitimately replies to and forwards a
-- great many messages in a working session, and an Operator with a grudge has
-- far more direct options than flooding a table.

-- ============================================================================
-- 1. MESSAGES
-- ============================================================================

create or replace function public.trg_limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant int := 30;
  v_recent int;
begin
  -- An Operator brokers every conversation on the platform; rate-limiting that
  -- would be rate-limiting the product.
  if exists (select 1 from public.profiles p
              where p.id = new.sender_id and p.role = 'operator') then
    return new;
  end if;

  select count(*) into v_recent
    from public.messages m
   where m.sender_id = new.sender_id
     and m.created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception
      'Rate limit: at most % messages per hour. Please wait before sending more.',
      v_limit
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limit_message_rate on public.messages;
create trigger trg_limit_message_rate
  before insert on public.messages
  for each row execute function public.trg_limit_message_rate();

-- ============================================================================
-- 2. LISTINGS
-- ============================================================================

create or replace function public.trg_limit_listing_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant int := 20;
  v_recent int;
begin
  if exists (select 1 from public.profiles p
              where p.id = new.user_id and p.role = 'operator') then
    return new;
  end if;

  select count(*) into v_recent
    from public.listings l
   where l.user_id = new.user_id
     and l.created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception
      'Rate limit: at most % listings per hour. Please wait before posting more.',
      v_limit
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limit_listing_rate on public.listings;
create trigger trg_limit_listing_rate
  before insert on public.listings
  for each row execute function public.trg_limit_listing_rate();

-- ============================================================================
-- 3. INDEXES
--
-- Both triggers count recent rows for one author on every insert. Without an
-- index that is a sequential scan per insert, which turns a flood stop into a
-- way of making a flood more expensive for the server than for the attacker.
-- ============================================================================

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

create index if not exists listings_user_created_idx
  on public.listings (user_id, created_at desc);
