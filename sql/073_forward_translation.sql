-- 073: a forwarded message can carry the Operator's translation, kept with the forward (owner, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 2).
-- applied-probe: select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'message_forward_log' and column_name = 'translation') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'message_forward_log' and column_name = 'translation_lang')
--
-- WHAT IT ADDS (additive: two nullable columns and one check; no row changes):
--   message_forward_log.translation        the translation the Operator saw and confirmed, exactly as shown
--   message_forward_log.translation_lang   'en' or 'es': the language it is in
-- A translation belongs to one forward, so it lives on the forward's own log row, not on the message. Who may read it is
-- already decided by that table's policies and nothing here changes them: message_forward_log_select = the recipient
-- (to_user_id) or an Operator, so the message's sender cannot read it; message_forward_log_insert = an Operator, as
-- themself. There is no update or delete policy, so a stored translation cannot be changed afterwards. The existing
-- table grants cover new columns, so no grant changes either.
-- The check: both columns empty (a forward without a translation, as before), or both filled with a language of
-- en/es and a translation of 1 to 6,000 characters.
alter table public.message_forward_log add column if not exists translation text;
alter table public.message_forward_log add column if not exists translation_lang text;
do $$
begin
  alter table public.message_forward_log add constraint message_forward_log_translation_check
    check ((translation is null and translation_lang is null)
        or (translation_lang is not null and translation_lang in ('en', 'es') and translation is not null
            and char_length(translation) between 1 and 6000));
exception when duplicate_object then null;
end $$;
