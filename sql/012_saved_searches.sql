-- 012_saved_searches.sql
--
-- A participant's saved searches, which double as their watchlist: a saved
-- search with nothing but a commodity in it is "watch this commodity", and the
-- dashboard shows both the same way. One table rather than two, because a
-- watchlist entry is a search with one criterion and splitting them would mean
-- two tables, two policies and two lists that answer the same question.
--
-- The criteria are stored, not the label. A saved search reads "Copper · Sell ·
-- Chile" in English and "Cobre · Venta · Chile" in Spanish, and a label stored
-- at save time would be frozen in whichever language the participant happened
-- to be using. The dashboard composes it at render time instead.
--
-- Nothing here weakens anonymity. A saved search matches against
-- get_public_listings(), the same anonymised view Browse already reads, so a
-- match tells a participant that a listing exists and nothing about who posted
-- it.

create table if not exists public.saved_searches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  commodity    text,
  listing_type text check (listing_type in ('sell','buy')),
  region       text,
  listing_status text check (listing_status in
                   ('available','under_review','negotiation','closed','archived')),
  created_at   timestamptz not null default now()
);

-- An empty criterion is stored as NULL, never as ''. Two ways to say "any"
-- would make the duplicate check below miss half of them.
alter table public.saved_searches
  add constraint saved_searches_no_empty_strings
  check (commodity <> '' and (region <> '' or region is null))
  not valid;

create index if not exists idx_saved_searches_user on public.saved_searches(user_id);

-- The same search saved twice is clutter, not a second search. Uniqueness has
-- to be over the coalesced values because NULLs never equal each other, and
-- "any commodity" saved twice is exactly the case worth catching.
create unique index if not exists idx_saved_searches_unique
  on public.saved_searches (
    user_id,
    coalesce(commodity, ''),
    coalesce(listing_type, ''),
    coalesce(region, ''),
    coalesce(listing_status, '')
  );

-- ------------------------------------------------------------------ RLS ----
--
-- Own rows only, in every direction. There is no update policy: a saved search
-- is four criteria and a participant who wants different ones removes it and
-- saves the search they actually want, which keeps the uniqueness index honest.
-- Operators are deliberately NOT granted a read here. They have no use for it,
-- and a participant's watchlist is a statement about what they are looking for
-- - commercially their own business, and not something the platform needs to
-- show anybody.

alter table public.saved_searches enable row level security;

drop policy if exists saved_searches_select on public.saved_searches;
create policy saved_searches_select on public.saved_searches for select
  using (user_id = public.current_profile_id());

drop policy if exists saved_searches_insert on public.saved_searches;
create policy saved_searches_insert on public.saved_searches for insert
  with check (user_id = public.current_profile_id());

drop policy if exists saved_searches_delete on public.saved_searches;
create policy saved_searches_delete on public.saved_searches for delete
  using (user_id = public.current_profile_id());

-- Supabase grants ALL on new public tables to anon/authenticated by default, so
-- the explicit revoke is what actually removes UPDATE - the grant below would
-- otherwise be a no-op over privileges that are already there (same pattern as
-- sql/010).
revoke all on public.saved_searches from anon, authenticated;
grant select, insert, delete on public.saved_searches to authenticated;
