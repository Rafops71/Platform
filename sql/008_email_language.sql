-- Jericho Platform — 008: language-aware notification emails.
--
-- Requirement (2026-08-27): a participant who chose Spanish must receive
-- notification emails in Spanish; everyone else keeps English. This covers
-- every participant-facing email the platform sends — invitation,
-- registration submitted, approved, rejected, and new-listing.
--
-- ----------------------------------------------------------------------------
-- HOW THE LANGUAGE IS DECIDED
--
-- From a stored column, never from a guess:
--
--   profiles.language     the participant's own choice. Written at
--                         registration from the language they filled the form
--                         in, and updated whenever they use the EN/ES toggle
--                         (js/app.js). Defaults to 'en'.
--   invitations.language  chosen by the operator when creating the invite.
--                         An invitation is the one email with no profile
--                         behind it yet, so it needs its own column.
--                         Defaults to 'en'.
--
-- Anything unknown, null or unrecognised falls back to English — see
-- public.norm_lang().
--
-- OPERATORS ALWAYS GET ENGLISH. The new-listing email goes to every approved
-- member, operators included; trg_queue_listing_emails() forces 'en' for
-- role = 'operator' regardless of what that operator's profile says, so an
-- operator who browses the participant UI in Spanish still gets English mail.
--
-- ----------------------------------------------------------------------------
-- WHERE THE WORDS COME FROM
--
-- Two dictionary tables, not string concatenation scattered through the
-- triggers and not translation done at send time:
--
--   email_templates(template_key, lang, subject, body_text)
--       one row per email per language, with {{placeholder}} slots.
--   email_phrases(phrase_key, lang, value)
--       the short fragments that get substituted INTO those slots and would
--       otherwise be untranslated English sitting inside a Spanish sentence:
--       the listing kind, the Origin/Destination label, the "none" fallbacks,
--       and the unit names.
--
-- Both are keyed (key, lang) and both fall back to the English row when a
-- translation is missing, so a half-finished third language degrades to
-- English rather than to an empty email.
--
-- ----------------------------------------------------------------------------
-- WHAT IS DELIBERATELY *NOT* TRANSLATED
--
-- Stored data values: commodity, country (origin/destination), incoterm and
-- currency. These are canonical English in the database by design — see the
-- populateSelect()/countryLabel() rule in js/i18n.js — and trade practice
-- keeps Incoterms and currency codes in English anyway.
--
-- Units ARE translated, because there are only eleven of them and they appear
-- inline in the quantity line of every listing email, where "5000 Metric
-- tons" in the middle of a Spanish paragraph reads badly. The keys mirror
-- js/i18n.js exactly ('unit.Metric tons'), so the two dictionaries stay
-- greppable against each other.
--
-- Country names are the visible inconsistency this leaves: a Spanish email
-- says "Origen: Belgium". Translating them would mean copying all 197
-- countries from js/i18n.js into SQL and keeping the two in step forever.
-- Flagged for Rafael rather than decided here.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 1. LANGUAGE COLUMNS
-- ============================================================================

alter table public.profiles
  add column if not exists language text not null default 'en';

alter table public.invitations
  add column if not exists language text not null default 'en';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table public.profiles
      add constraint profiles_language_check check (language in ('en', 'es'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitations_language_check') then
    alter table public.invitations
      add constraint invitations_language_check check (language in ('en', 'es'));
  end if;
end $$;

-- profiles.language is deliberately NOT added to the protected-column list in
-- protect_profile_columns(): a participant changing their own language is the
-- whole point, and unlike role/status/email it grants nothing.

/** Anything unusable becomes English. One place, so every caller agrees. */
create or replace function public.norm_lang(p_lang text)
returns text
language sql
immutable
as $$
  select case when p_lang in ('en', 'es') then p_lang else 'en' end;
$$;

-- ============================================================================
-- 2. THE DICTIONARIES
-- ============================================================================

create table if not exists public.email_templates (
  template_key text not null,
  lang         text not null check (lang in ('en', 'es')),
  subject      text not null,
  body_text    text not null,
  primary key (template_key, lang)
);

create table if not exists public.email_phrases (
  phrase_key text not null,
  lang       text not null check (lang in ('en', 'es')),
  value      text not null,
  primary key (phrase_key, lang)
);

-- Read by security-definer trigger functions only. Same reasoning as
-- email_outbox in 003: RLS on, no policies, no client session gets in.
alter table public.email_templates enable row level security;
alter table public.email_phrases   enable row level security;

/** One phrase, with an English fallback, then the key itself so a missing
 *  entry is visible in the output instead of silently blank. */
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

/** Render one template: pick the language row (English if absent), then
 *  substitute every {{key}} from p_vars. */
create or replace function public.render_email(
  p_key text, p_lang text, p_vars jsonb default '{}'::jsonb
)
returns table (subject text, body_text text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_body    text;
  k         text;
  v         text;
begin
  select t.subject, t.body_text into v_subject, v_body
    from public.email_templates t
   where t.template_key = p_key and t.lang = public.norm_lang(p_lang);

  if v_subject is null then
    select t.subject, t.body_text into v_subject, v_body
      from public.email_templates t
     where t.template_key = p_key and t.lang = 'en';
  end if;

  if v_subject is null then
    raise exception 'No email template for key %', p_key;
  end if;

  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_subject := replace(v_subject, '{{' || k || '}}', coalesce(v, ''));
    v_body    := replace(v_body,    '{{' || k || '}}', coalesce(v, ''));
  end loop;

  return query select v_subject, v_body;
end;
$$;

-- ============================================================================
-- 3. PHRASES
-- ============================================================================

insert into public.email_phrases (phrase_key, lang, value) values
  ('kind.sell',   'en', 'Sell Offer'),
  ('kind.sell',   'es', 'Oferta de venta'),
  ('kind.buy',    'en', 'Buy Request'),
  ('kind.buy',    'es', 'Solicitud de compra'),
  ('label.origin',      'en', 'Origin'),
  ('label.origin',      'es', 'Origen'),
  ('label.destination', 'en', 'Destination'),
  ('label.destination', 'es', 'Destino'),
  ('docs.none',   'en', 'None indicated'),
  ('docs.none',   'es', 'Ninguno indicado'),
  ('value.none',  'en', '—'),
  ('value.none',  'es', '—'),
  -- Units. Keys mirror js/i18n.js. DMTU keeps its English acronym, as it does
  -- on Spanish-language contracts.
  ('unit.Barrels',                      'en', 'Barrels'),
  ('unit.Barrels',                      'es', 'Barriles'),
  ('unit.Bushels',                      'en', 'Bushels'),
  ('unit.Bushels',                      'es', 'Bushels'),
  ('unit.Cubic meters',                 'en', 'Cubic meters'),
  ('unit.Cubic meters',                 'es', 'Metros cúbicos'),
  ('unit.Dry Metric Ton Units (DMTU)',  'en', 'Dry Metric Ton Units (DMTU)'),
  ('unit.Dry Metric Ton Units (DMTU)',  'es', 'Unidades de tonelada métrica seca (DMTU)'),
  ('unit.Gallons',                      'en', 'Gallons'),
  ('unit.Gallons',                      'es', 'Galones'),
  ('unit.Grams',                        'en', 'Grams'),
  ('unit.Grams',                        'es', 'Gramos'),
  ('unit.Kilograms',                    'en', 'Kilograms'),
  ('unit.Kilograms',                    'es', 'Kilogramos'),
  ('unit.Liters',                       'en', 'Liters'),
  ('unit.Liters',                       'es', 'Litros'),
  ('unit.Metric tons',                  'en', 'Metric tons'),
  ('unit.Metric tons',                  'es', 'Toneladas métricas'),
  ('unit.Ounces',                       'en', 'Ounces'),
  ('unit.Ounces',                       'es', 'Onzas'),
  ('unit.Pounds',                       'en', 'Pounds'),
  ('unit.Pounds',                       'es', 'Libras')
on conflict (phrase_key, lang) do update set value = excluded.value;

-- ============================================================================
-- 4. TEMPLATES
--
-- The English text is carried over verbatim from 003/005 so existing mail
-- reads exactly as before and the assertions in tests/e2e/full-flow.spec.js
-- still match. The Spanish uses the formal "usted" throughout — this is B2B
-- trade correspondence — and the register fixed in js/i18n.js: publicación,
-- materia prima, observaciones, buzón.
-- ============================================================================

insert into public.email_templates (template_key, lang, subject, body_text) values

-- ---- invitation ------------------------------------------------------------
('invitation', 'en',
 'You have been invited to the Jericho Platform',
 'You have been invited to join the Jericho Platform.' || E'\n\n' ||
 'Use this link to create your account:' || E'\n' ||
 '{{link}}' || E'\n\n' ||
 'The link is valid for 5 days and can only be used once.' || E'\n\n' ||
 'Once you register, an operator reviews your application and you will be ' ||
 'emailed when it is approved.'),

('invitation', 'es',
 'Le han invitado a la Plataforma Jericho',
 'Le han invitado a unirse a la Plataforma Jericho.' || E'\n\n' ||
 'Utilice este enlace para crear su cuenta:' || E'\n' ||
 '{{link}}' || E'\n\n' ||
 'El enlace es válido durante 5 días y solo puede utilizarse una vez.' || E'\n\n' ||
 'Una vez que se registre, un operador revisará su solicitud y recibirá un ' ||
 'correo cuando sea aprobada.'),

-- ---- registration submitted ------------------------------------------------
('registration_submitted', 'en',
 'Your Jericho Platform registration has been submitted',
 'Hello {{first_name}},' || E'\n\n' ||
 'Thank you — your registration for the Jericho Platform has been received ' ||
 'and is now awaiting review by an operator.' || E'\n\n' ||
 'You will receive another email once a decision has been made. You will ' ||
 'not be able to sign in until your account is approved.'),

('registration_submitted', 'es',
 'Hemos recibido su registro en la Plataforma Jericho',
 'Hola {{first_name}}:' || E'\n\n' ||
 'Gracias. Hemos recibido su registro en la Plataforma Jericho y queda ' ||
 'pendiente de revisión por un operador.' || E'\n\n' ||
 'Recibirá otro correo cuando se haya tomado una decisión. No podrá iniciar ' ||
 'sesión hasta que su cuenta sea aprobada.'),

-- ---- approved --------------------------------------------------------------
('registration_approved', 'en',
 'Your Jericho Platform registration has been approved',
 'Hello {{first_name}},' || E'\n\n' ||
 'Good news — your registration for the Jericho Platform has been approved.' || E'\n\n' ||
 'You can now sign in and start posting and browsing listings.'),

('registration_approved', 'es',
 'Su registro en la Plataforma Jericho ha sido aprobado',
 'Hola {{first_name}}:' || E'\n\n' ||
 'Buenas noticias: su registro en la Plataforma Jericho ha sido aprobado.' || E'\n\n' ||
 'Ya puede iniciar sesión y comenzar a publicar y consultar publicaciones.'),

-- ---- rejected --------------------------------------------------------------
('registration_rejected', 'en',
 'Your Jericho Platform registration was not approved',
 'Hello {{first_name}},' || E'\n\n' ||
 'Thank you for your interest in the Jericho Platform. After review, your ' ||
 'registration has not been approved and your account will not be activated.' || E'\n\n' ||
 'If you believe this was a mistake, please reply to the operator who ' ||
 'invited you.'),

('registration_rejected', 'es',
 'Su registro en la Plataforma Jericho no ha sido aprobado',
 'Hola {{first_name}}:' || E'\n\n' ||
 'Gracias por su interés en la Plataforma Jericho. Tras la revisión, su ' ||
 'registro no ha sido aprobado y su cuenta no será activada.' || E'\n\n' ||
 'Si cree que se trata de un error, responda al operador que le invitó.'),

-- ---- new listing -----------------------------------------------------------
-- {{origin_line}} is a whole pre-rendered line, because sell offers say
-- Origin and buy requests say Destination.
('new_listing', 'en',
 'New {{kind}} — {{commodity}} ({{ref}})',
 'A new {{kind}} was posted on the Jericho Platform.' || E'\n\n' ||
 'Reference: {{ref}}' || E'\n' ||
 'Type: {{kind}}' || E'\n' ||
 'Commodity: {{commodity}}' || E'\n' ||
 'Quantity: {{quantity}} {{unit}}' || E'\n' ||
 'Specification: {{spec}}' || E'\n' ||
 'Incoterm: {{incoterm}}' || E'\n' ||
 '{{origin_line}}' || E'\n' ||
 'Price / Conditions: {{price}}' || E'\n' ||
 'Notes: {{notes}}' || E'\n' ||
 'Documents available: {{docs}}' || E'\n\n' ||
 'This listing is posted anonymously — sign in to the platform to respond via the mailbox.'),

('new_listing', 'es',
 'Nueva {{kind}} — {{commodity}} ({{ref}})',
 'Se ha publicado una nueva {{kind}} en la Plataforma Jericho.' || E'\n\n' ||
 'Referencia: {{ref}}' || E'\n' ||
 'Tipo: {{kind}}' || E'\n' ||
 'Materia prima: {{commodity}}' || E'\n' ||
 'Cantidad: {{quantity}} {{unit}}' || E'\n' ||
 'Especificación / grado: {{spec}}' || E'\n' ||
 'Incoterm: {{incoterm}}' || E'\n' ||
 '{{origin_line}}' || E'\n' ||
 'Precio / condiciones: {{price}}' || E'\n' ||
 'Observaciones: {{notes}}' || E'\n' ||
 'Documentos disponibles: {{docs}}' || E'\n\n' ||
 'Esta publicación es anónima: inicie sesión en la plataforma para responder a través del buzón.')

on conflict (template_key, lang) do update
  set subject = excluded.subject, body_text = excluded.body_text;

-- ============================================================================
-- 5. THE PRODUCERS, REWIRED
-- ============================================================================

-- ---- invitation ------------------------------------------------------------
-- Replaces the 2-argument version from 005. p_lang defaults to 'en', so an
-- older 2-argument call still resolves here and still sends English.
drop function if exists public.queue_invitation_email(text, text);

create or replace function public.queue_invitation_email(
  p_to_email text, p_link text, p_lang text default 'en'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_body    text;
begin
  if not public.is_operator() then
    raise exception 'Only an operator may send invitations';
  end if;

  if p_to_email is null or position('@' in p_to_email) = 0 then
    raise exception 'A valid email address is required';
  end if;

  select r.subject, r.body_text into v_subject, v_body
    from public.render_email('invitation', p_lang,
           jsonb_build_object('link', p_link)) r;

  insert into public.email_outbox (to_email, subject, body_text)
  values (p_to_email, v_subject, v_body);
end;
$$;

grant execute on function public.queue_invitation_email(text, text, text) to authenticated;

-- ---- registration submitted ------------------------------------------------
create or replace function public.trg_email_registration_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_body    text;
begin
  if new.status = 'pending' and new.email is not null then
    select r.subject, r.body_text into v_subject, v_body
      from public.render_email('registration_submitted', new.language,
             jsonb_build_object('first_name', coalesce(new.first_name, ''))) r;

    insert into public.email_outbox (to_email, subject, body_text)
    values (new.email, v_subject, v_body);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_registration_submitted on public.profiles;
create trigger trg_email_registration_submitted
  after insert on public.profiles
  for each row execute function public.trg_email_registration_submitted();

-- ---- approved / rejected ---------------------------------------------------
create or replace function public.trg_email_profile_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key     text;
  v_subject text;
  v_body    text;
begin
  if new.status is not distinct from old.status or new.email is null then
    return new;
  end if;

  if new.status = 'approved' then
    v_key := 'registration_approved';
  elsif new.status = 'rejected' then
    v_key := 'registration_rejected';
  else
    return new;
  end if;

  select r.subject, r.body_text into v_subject, v_body
    from public.render_email(v_key, new.language,
           jsonb_build_object('first_name', coalesce(new.first_name, ''))) r;

  insert into public.email_outbox (to_email, subject, body_text)
  values (new.email, v_subject, v_body);

  return new;
end;
$$;

drop trigger if exists trg_email_profile_decision on public.profiles;
create trigger trg_email_profile_decision
  after update on public.profiles
  for each row execute function public.trg_email_profile_decision();

-- ---- new listing -----------------------------------------------------------
-- One row per approved member excluding the poster, each rendered in that
-- member's own language. Operators are forced to English.
create or replace function public.trg_queue_listing_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_docs_en text;
  rec       record;
  v_lang    text;
  v_kind    text;
  v_docs    text;
  v_subject text;
  v_body    text;
begin
  -- Document type names are canonical English stored values (the
  -- document_checklist CHECK constraint is written against them), so they go
  -- out as they are; only the "none" fallback is translated.
  select string_agg(doc_type, ', ' order by doc_type)
    into v_docs_en
    from public.document_checklist
    where listing_id = new.id and indicated = true;

  for rec in
    select au.email, p.role, p.language
      from public.profiles p
      join auth.users au on au.id = p.user_id
     where p.status = 'approved'
       and p.id <> new.user_id
       and au.email is not null
  loop
    -- An operator's own language choice never affects operator mail.
    v_lang := case when rec.role = 'operator' then 'en'
                   else public.norm_lang(rec.language) end;

    v_kind := public.email_phrase(
                case when new.type = 'sell' then 'kind.sell' else 'kind.buy' end, v_lang);
    v_docs := coalesce(v_docs_en, public.email_phrase('docs.none', v_lang));

    select r.subject, r.body_text into v_subject, v_body
      from public.render_email('new_listing', v_lang, jsonb_build_object(
        'kind',      v_kind,
        'ref',       new.reference_number,
        'commodity', new.commodity,
        'quantity',  coalesce(new.quantity::text, public.email_phrase('value.none', v_lang)),
        'unit',      case when new.unit is null then ''
                          else public.email_phrase('unit.' || new.unit, v_lang) end,
        'spec',      coalesce(new.specification, public.email_phrase('value.none', v_lang)),
        'incoterm',  new.incoterm,
        'origin_line',
          case when new.type = 'sell'
            then public.email_phrase('label.origin', v_lang) || ': ' ||
                 coalesce(new.origin, public.email_phrase('value.none', v_lang))
            else public.email_phrase('label.destination', v_lang) || ': ' ||
                 coalesce(new.destination, public.email_phrase('value.none', v_lang))
          end,
        'price',
          coalesce(new.price_conditions, public.email_phrase('value.none', v_lang)) ||
          case when new.currency is not null then ' ' || new.currency else '' end,
        'notes',     coalesce(new.notes, public.email_phrase('value.none', v_lang)),
        'docs',      v_docs
      )) r;

    insert into public.email_outbox (to_email, subject, body_text, related_listing_id)
    values (rec.email, v_subject, v_body, new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_queue_listing_emails on public.listings;
create trigger trg_queue_listing_emails
  after insert on public.listings
  for each row execute function public.trg_queue_listing_emails();

-- ============================================================================
-- 6. CARRY THE CHOICE IN FROM REGISTRATION
--
-- handle_new_user() builds the profile from the signUp metadata. js/auth.js
-- now puts the language the registrant filled the form in into that metadata;
-- norm_lang() turns anything else into 'en'.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, first_name, last_name, company, email, phone, country, role, status, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'company',
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'country', ''),
    'participant',   -- hardcoded, never taken from client input
    'pending',       -- hardcoded, never taken from client input
    public.norm_lang(new.raw_user_meta_data->>'language')
  );

  perform public.log_activity(
    (select id from public.profiles where user_id = new.id),
    'user_registered',
    jsonb_build_object('email', lower(new.email))
  );

  return new;
end;
$$;
