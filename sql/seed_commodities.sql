-- ============================================================================
-- Jericho Platform — Commodity list seed
--
-- Run AFTER 002_updates.sql. Safe to re-run: existing names are left alone.
--
-- Note on "Other": the supplied list's 23rd entry is "Other". It is NOT
-- seeded as a row here, because every listing form already offers a built-in
-- "Other (specify)" choice with a free-text box (spec Section 8 requires that
-- fallback). Seeding a plain "Other" row as well would put two different
-- "Other" entries in the same dropdown, one of which silently discards the
-- typed-in commodity name. The dropdown still shows 23 choices: these 22
-- plus "Other (specify)".
-- ============================================================================

-- Preserve the intended ordering (grouped by metal/energy family) rather than
-- alphabetising, which would scatter related commodities apart.
alter table public.commodities add column if not exists sort_order integer;

insert into public.commodities (name, sort_order) values
  ('Copper Cathodes — Grade A',      1),
  ('Copper Concentrate',             2),
  ('Aluminum Ingots — A7/A8',        3),
  ('Zinc Ingots',                    4),
  ('Zinc Concentrate',               5),
  ('Lead Ingots',                    6),
  ('Lead Concentrate',               7),
  ('Manganese Ore',                  8),
  ('Manganese Concentrate',          9),
  ('Chrome Ore',                    10),
  ('Chrome Concentrate',            11),
  ('Ferrochrome',                   12),
  ('Iron Ore',                      13),
  ('Hot Briquetted Iron (HBI)',     14),
  ('HMS 1&2 Scrap',                 15),
  ('Steel Billets',                 16),
  ('EN590 Diesel',                  17),
  ('Jet A-1',                       18),
  ('Crude Oil',                     19),
  ('LNG',                           20),
  ('Petroleum Coke',                21),
  ('Thermal Coal',                  22)
on conflict (name) do update set sort_order = excluded.sort_order;

-- Anything added later by an Operator through the UI sorts after the seeds.
update public.commodities set sort_order = 999 where sort_order is null;
