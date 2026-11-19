-- Revert of sql/070. Drops the two new functions and the index; 069's own counters were never touched and keep working.
-- No member's data is involved. Safe to run twice.
begin;
drop function if exists public.translate_release_slot(uuid, timestamptz);
drop function if exists public.translate_take_slot(uuid, integer);
drop index if exists public.member_translate_usage_hour_idx;
commit;
