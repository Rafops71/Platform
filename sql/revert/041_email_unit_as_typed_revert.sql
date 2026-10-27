-- Undo 041: email_phrase() falls back to the key again, for units too (as 008).
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
  return coalesce(v, p_key);
end;
$$;
