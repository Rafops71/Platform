-- Jericho Platform — 007: add Antimony, alphabetise the commodity list.
--
-- The seed originally grouped commodities by metal/energy family (all the
-- coppers together, then zincs, then fuels). Confirmed 2026-08-26: plain
-- alphabetical is wanted instead — with a browsable dropdown of 20+ entries,
-- finding a known name beats discovering related ones.
--
-- sort_order is recomputed rather than hand-numbered so it cannot drift out of
-- alphabetical as commodities are added. Re-running this file re-sorts
-- whatever is in the table at the time, including operator-added entries.
--
-- "Other" is deliberately excluded from the ordering and pinned last. Note
-- that no "Other" row is seeded at all (see sql/seed_commodities.sql for why —
-- the listing form supplies its own "Other (specify)" free-text choice); this
-- clause only exists so that an operator who adds one through the UI does not
-- end up with it sorted between "Manganese Ore" and "Petroleum Coke".
-- ----------------------------------------------------------------------------

insert into public.commodities (name) values ('Antimony')
on conflict (name) do nothing;

-- Case-insensitive so "LNG" files under L with "Lead", not ahead of every
-- lowercase name — byte order would otherwise put all-caps entries first.
with ordered as (
  select id, row_number() over (order by lower(name)) as rn
    from public.commodities
   where lower(name) <> 'other'
)
update public.commodities c
   set sort_order = o.rn
  from ordered o
 where c.id = o.id;

update public.commodities
   set sort_order = 999
 where lower(name) = 'other';
