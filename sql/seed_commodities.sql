-- ============================================================================
-- Jericho Platform — Commodity list seed
--
-- Run AFTER 002_updates.sql. Safe to re-run: existing names are left alone.
--
-- Note on "Other": the supplied list ends with "Other". It is NOT seeded as a
-- row here, because every listing form already offers a built-in
-- "Other (specify)" choice with a free-text box (spec Section 8 requires that
-- fallback). Seeding a plain "Other" row as well would put two different
-- "Other" entries in the same dropdown, one of which silently discards the
-- typed-in commodity name. The dropdown shows these 23 plus "Other (specify)",
-- which is always rendered last regardless of sort order.
-- ============================================================================

-- Alphabetical by name (confirmed 2026-08-26; the list was previously grouped
-- by metal/energy family). sort_order is computed at the end rather than
-- hand-numbered here, so inserting a commodity into this list does not mean
-- renumbering every line below it.
alter table public.commodities add column if not exists sort_order integer;

insert into public.commodities (name) values
  ('Aluminum Ingots — A7/A8'),
  ('Antimony'),
  ('Chrome Concentrate'),
  ('Chrome Ore'),
  ('Copper Cathodes — Grade A'),
  ('Copper Concentrate'),
  ('Crude Oil'),
  ('EN590 Diesel'),
  ('Ferrochrome'),
  ('HMS 1&2 Scrap'),
  ('Hot Briquetted Iron (HBI)'),
  ('Iron Ore'),
  ('Jet A-1'),
  ('Lead Concentrate'),
  ('Lead Ingots'),
  ('LNG'),
  ('Manganese Concentrate'),
  ('Manganese Ore'),
  ('Petroleum Coke'),
  ('Steel Billets'),
  ('Thermal Coal'),
  ('Zinc Concentrate'),
  ('Zinc Ingots')
on conflict (name) do nothing;

-- Number every commodity alphabetically, operator-added entries included, so
-- the dropdown stays in one consistent order. Case-insensitive, so "LNG"
-- files under L with "Lead" rather than ahead of every lowercase name.
-- "Other" is pinned last — see the header note on why no such row is seeded.
with ordered as (
  select id, row_number() over (order by lower(name)) as rn
    from public.commodities
   where lower(name) <> 'other'
)
update public.commodities c
   set sort_order = o.rn
  from ordered o
 where c.id = o.id;

update public.commodities set sort_order = 999 where lower(name) = 'other';
