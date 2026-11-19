-- Revert of sql/069 (Translate). Drops the five new objects. The cache, the hourly counts and the daily units are
-- derived and disposable: no member's data, no listing and no message is touched. Safe to run twice.
begin;
drop function if exists public.translate_release_budget(text, numeric);
drop function if exists public.translate_reserve_budget(text, numeric, numeric);
drop function if exists public.translate_release_member_slot(uuid);
drop function if exists public.translate_take_member_slot(uuid, integer);
drop function if exists public.get_listing_texts(uuid);
drop table if exists public.translate_daily_budget;
drop table if exists public.member_translate_usage;
drop table if exists public.listing_translations;
commit;
