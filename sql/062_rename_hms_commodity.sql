-- 062: the commodity "HMS 1&2 Scrap" is now named "HMS 1&2 (80:20)" (owner's decision,
-- 2026-11-15: "Rename everywhere", wording exactly "HMS 1&2 (80:20)").
--
-- WHY EVERYWHERE: listings and saved searches store the commodity by NAME, as plain text, not
-- by id (sql/schema.sql: listings.commodity is not a foreign key; saved_searches.commodity is
-- text). Renaming only the commodity-list row would leave every existing listing and saved
-- search on the old name, and the two names would no longer match each other. So the same
-- statement run renames the list row AND the two columns.
--
-- WHAT IT CHANGES, nothing else:
--   public.commodities    the one row named 'HMS 1&2 Scrap' (same id, same sort order)
--   public.saved_searches rows whose commodity is exactly 'HMS 1&2 Scrap'
--   public.listings       rows whose commodity is exactly 'HMS 1&2 Scrap'
-- Exact text only: a free-text variant someone typed under "Other" is not touched.
-- On the live database, read before this was written: 0 listings and 0 saved searches carried
-- the old name and the list held exactly one such row.
--
-- LISTINGS ARE RENAMED WITHOUT TWO SIDE EFFECTS. Updating a listing normally (a) sets its
-- updated_at to now(), which would make a stale listing look freshly confirmed by its owner
-- (trg_protect_listing_columns), and (b) re-runs matching, which would notify every Operator
-- of "new" matches for pairs that already exist (on_listing_matchable). Neither is wanted for
-- a relabel, so those two triggers are switched off for that one UPDATE and switched on again
-- straight after, in the same transaction (a failure puts everything back). The activity log
-- is NOT switched off: each renamed listing gets a 'listing_edited' line with no actor.
-- Only done if a listing actually carries the old name.
--
-- IDEMPOTENT: a second run finds nothing to rename. If a list row with the NEW name already
-- exists (it would break the unique name), the old list row is left alone, with a NOTICE, and
-- the listings and saved searches are still moved to the new name.
-- Revert: sql/revert/062_rename_hms_commodity_revert.sql (the same rename, backwards; it also
-- moves any listing or saved search created with the new name since).
-- Proof: sql/tests/33_rename_hms_commodity.sql.

begin;

do $rename$
declare
  c_old constant text := 'HMS 1&2 Scrap';
  c_new constant text := 'HMS 1&2 (80:20)';
begin
  if exists (select 1 from public.commodities where name = c_new) then
    if exists (select 1 from public.commodities where name = c_old) then
      raise notice 'a commodity named % already exists: the row named % is left as it is', c_new, c_old;
    end if;
  else
    update public.commodities set name = c_new where name = c_old;
  end if;

  update public.saved_searches set commodity = c_new where commodity = c_old;

  if exists (select 1 from public.listings where commodity = c_old) then
    alter table public.listings disable trigger trg_protect_listing_columns;
    alter table public.listings disable trigger on_listing_matchable;
    update public.listings set commodity = c_new where commodity = c_old;
    alter table public.listings enable trigger trg_protect_listing_columns;
    alter table public.listings enable trigger on_listing_matchable;
  end if;
end
$rename$;

commit;
