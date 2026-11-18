-- Revert 056: take the Terms-changed email back out.
-- Refuses if it has already been used: a queued email or a stored change
-- summary is a record that must not be dropped without the owner's say-so.
begin;

do $$
begin
  if exists (select 1 from public.terms_change_emails) then
    raise exception 'refusing: Terms-changed emails have been queued (terms_change_emails); needs the owner''s say-so';
  end if;
  if exists (select 1 from public.terms_versions where change_summary is not null) then
    raise exception 'refusing: a Terms version carries a change summary; needs the owner''s say-so';
  end if;
end $$;

drop trigger if exists trg_terms_changed_email on public.terms_versions;
drop trigger if exists trg_terms_version_dates on public.terms_versions;
drop function if exists public.trg_terms_changed_email();
drop function if exists public.trg_terms_version_dates();
drop function if exists public.terms_effective_text(timestamptz, text);
drop table if exists public.terms_change_emails;
delete from public.email_templates where template_key = 'terms_changed';
alter table public.terms_versions drop column if exists change_summary;
alter table public.terms_versions drop column if exists effective_at;

commit;
