-- 056: the Terms-changed email (owner-approved design, 2026-11-08).
--
-- When a new Terms version is published, every approved participant whose
-- language has a published row for that version is emailed once: the date the
-- new Terms take effect (7 days after publication), the summary of changes for
-- that language, and a link to the full Terms. Nothing is sent to pending,
-- suspended or rejected profiles, to operators, or to test accounts (the same
-- markers as sql/048).
--
-- A version with members to email but no change summary is refused: the
-- publish fails rather than emailing a blank summary. A version with no
-- members to email in its language needs no summary.
--
-- Additive: two nullable columns on terms_versions, one table, one pair of
-- templates, three functions and two triggers. Nothing existing is changed.
-- Revert: sql/revert/056_terms_change_email_revert.sql (proven on a throwaway
-- database before this was committed).

begin;

alter table public.terms_versions add column if not exists effective_at  timestamptz;
alter table public.terms_versions add column if not exists change_summary text;

-- The date a version takes effect: seven days after it is published.
create or replace function public.trg_terms_version_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.effective_at := coalesce(new.effective_at, new.published_at + interval '7 days');
  return new;
end;
$$;

drop trigger if exists trg_terms_version_dates on public.terms_versions;
create trigger trg_terms_version_dates
  before insert on public.terms_versions
  for each row execute function public.trg_terms_version_dates();

-- "15 November 2026" in English, "15 de noviembre de 2026" in Spanish.
-- Internal: a helper for the trigger below, not an API, so no one may call it.
create or replace function public.terms_effective_text(p_at timestamptz, p_lang text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  d  date := (p_at at time zone 'UTC')::date;
  en text[] := array['January','February','March','April','May','June','July',
                     'August','September','October','November','December'];
  es text[] := array['enero','febrero','marzo','abril','mayo','junio','julio',
                     'agosto','septiembre','octubre','noviembre','diciembre'];
begin
  if p_at is null then raise exception 'a Terms version has no effective date'; end if;
  if public.norm_lang(p_lang) = 'es' then
    return extract(day from d)::int || ' de ' || es[extract(month from d)::int]
           || ' de ' || extract(year from d)::int;
  end if;
  return extract(day from d)::int || ' ' || en[extract(month from d)::int]
         || ' ' || extract(year from d)::int;
end;
$$;

revoke all on function public.terms_effective_text(timestamptz, text) from public, anon, authenticated;

-- One row per version and member, so a member is emailed once per version.
create table if not exists public.terms_change_emails (
  version    text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  queued_at  timestamptz not null default now(),
  primary key (version, profile_id)
);
alter table public.terms_change_emails enable row level security;
revoke all on public.terms_change_emails from anon, authenticated;

insert into public.email_templates (template_key, lang, subject, body_text) values
('terms_changed', 'en',
 'MyPlatform Terms: changes from {{date}}',
 'Dear {{first_name}},' || E'\n' ||
 'The MyPlatform Terms change on {{date}}. Summary of the changes:' || E'\n' ||
 '{{summary}}' || E'\n' ||
 'Full Terms: https://app.myplatform.trade/terms.html' || E'\n' ||
 'The Operator, MyPlatform'),
('terms_changed', 'es',
 'Términos de MyPlatform: cambios desde el {{date}}',
 'Estimado/a {{first_name}}:' || E'\n' ||
 'Los Términos de MyPlatform cambian el {{date}}. Resumen de los cambios:' || E'\n' ||
 '{{summary}}' || E'\n' ||
 'Términos completos: https://app.myplatform.trade/terms.html' || E'\n' ||
 'El Operador, MyPlatform')
on conflict do nothing;

create or replace function public.trg_terms_changed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_subject text;
  v_body    text;
begin
  for r in
    select p.id, p.email, p.first_name
      from public.profiles p
     where p.status = 'approved'
       and p.role = 'participant'
       and public.norm_lang(p.language) = new.language
     order by p.id
  loop
    -- Test accounts get nothing (same markers as sql/048 and sql/047).
    if r.email ~* '@example\.(invalid|com|org|net)$' or lower(r.email) like 'jericho-e2e-%' then
      continue;
    end if;
    -- Already emailed for this version: once only.
    if exists (select 1 from public.terms_change_emails e
                where e.version = new.version and e.profile_id = r.id) then
      continue;
    end if;
    -- A blank summary is never sent. The publish fails instead.
    if coalesce(btrim(new.change_summary), '') = '' then
      raise exception 'Terms % (%) has approved members to email but no change summary', new.version, new.language;
    end if;

    insert into public.terms_change_emails (version, profile_id) values (new.version, r.id);

    select t.subject, t.body_text into v_subject, v_body
      from public.render_email('terms_changed', new.language, jsonb_build_object(
             'first_name', coalesce(r.first_name, ''),
             'date',       public.terms_effective_text(new.effective_at, new.language),
             'summary',    new.change_summary)) t;

    insert into public.email_outbox (to_email, subject, body_text) values (r.email, v_subject, v_body);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_terms_changed_email on public.terms_versions;
create trigger trg_terms_changed_email
  after insert on public.terms_versions
  for each row execute function public.trg_terms_changed_email();

commit;
