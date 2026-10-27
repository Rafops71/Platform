-- Jericho Platform — 041: an unknown unit is written as the member typed it.
--
-- Found by scripts/email-scan.js on 2026-10-27: the unit is free text in the
-- database (only the form offers a list), and email_phrase() answers a phrase
-- it does not know with its own key - so a listing in "mt" went out to every
-- member as "250 unit.mt". For units only, the fallback is now the unit
-- itself. Any other missing phrase still shows its key, on purpose (008).
--
-- Adds nothing and removes nothing; undo: sql/revert/041_email_unit_as_typed_revert.sql.

create or replace function public.email_phrase(p_key text, p_lang text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  select value into v from public.email_phrases
   where phrase_key = p_key and lang = public.norm_lang(p_lang);
  if v is null then
    select value into v from public.email_phrases
     where phrase_key = p_key and lang = 'en';
  end if;
  return coalesce(v, case when p_key like 'unit.%' then substr(p_key, 6) else p_key end);
end;
$$;
