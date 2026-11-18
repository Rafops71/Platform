-- Revert 062: the commodity is named "HMS 1&2 Scrap" again, everywhere 062 renamed it.
--
-- The same rename as 062, backwards, with the same care: the commodity-list row (same id), the
-- saved searches, and the listings, the last without touching their updated_at and without
-- re-running matching (trg_protect_listing_columns and on_listing_matchable are switched off
-- for that one UPDATE and on again, in the same transaction). Anything stored with the NEW
-- name since 062, including a listing a member created that way, is renamed back too.
-- If a list row with the old name already exists, the new-name row is left alone with a NOTICE.

begin;

do $rename$
declare
  c_old constant text := 'HMS 1&2 (80:20)';
  c_new constant text := 'HMS 1&2 Scrap';
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
