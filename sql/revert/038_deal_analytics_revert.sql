-- Undo 038. A read-only function: removing it loses nothing recorded.
begin;
drop function if exists public.deal_analytics(text, int);
commit;
