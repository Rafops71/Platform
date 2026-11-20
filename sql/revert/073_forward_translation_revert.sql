-- Revert of sql/073: drops the check and the two columns. Any translation already stored with a forward is lost
-- (the forwarded messages themselves, and every other column, are untouched). Safe to run twice.
begin;
alter table public.message_forward_log drop constraint if exists message_forward_log_translation_check;
alter table public.message_forward_log drop column if exists translation_lang;
alter table public.message_forward_log drop column if exists translation;
commit;
