-- Undo 037. A read-only function: removing it loses nothing recorded.
begin;
drop function if exists public.member_scorecard(uuid);
commit;
