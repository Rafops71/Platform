-- 048 (decision 43): when a member signs the Terms, they get a receipt email.
-- The email names the Terms version and the date and carries nothing else. It goes
-- to the member's own address, in the language they signed in. Test accounts are
-- skipped with the same marker as sql/047 (the reserved domains and the e2e prefix);
-- nothing is deleted.

insert into public.email_templates (template_key, lang, subject, body_text) values
('terms_receipt', 'en',
 'Your signed MyPlatform Terms: receipt',
 'Hello {{first_name}},' || E'\n\n' ||
 'Thank you. You signed version {{version}} of the MyPlatform Terms on {{date}}.' || E'\n\n' ||
 'This email is your receipt. Keep it for your records.' || E'\n\n' ||
 'If you did not sign these Terms, reply to the Operator at once.'),
('terms_receipt', 'es',
 'Sus Términos de MyPlatform firmados: recibo',
 'Hola {{first_name}}:' || E'\n\n' ||
 'Gracias. Firmó la versión {{version}} de los Términos de MyPlatform el {{date}}.' || E'\n\n' ||
 'Este correo es su recibo. Guárdelo para sus registros.' || E'\n\n' ||
 'Si usted no firmó estos Términos, responda al Operador de inmediato.')
on conflict do nothing;

create or replace function public.trg_terms_receipt_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text;
  v_first_name text;
  v_lang       text;
  v_subject    text;
  v_body       text;
begin
  -- Only a real signature earns a receipt: an unsigned row is not a signing.
  if new.signed_name is null then return new; end if;
  -- An update of a row that was already signed is not a new signing.
  if tg_op = 'UPDATE' and old.signed_name is not null then return new; end if;

  select p.email, p.first_name, p.language into v_email, v_first_name, v_lang
    from public.profiles p where p.id = new.profile_id;
  if v_email is null then return new; end if;

  -- Test accounts get no receipt (same marker as sql/047 and sql/027).
  if v_email ~* '@example\.(invalid|com|org|net)$' or lower(v_email) like 'jericho-e2e-%' then
    return new;
  end if;

  select t.subject, t.body_text into v_subject, v_body
    from public.render_email('terms_receipt', coalesce(v_lang, 'en'),
           jsonb_build_object('first_name', coalesce(v_first_name, ''),
                              'version', new.version,
                              'date', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))) t;

  insert into public.email_outbox (to_email, subject, body_text)
    values (v_email, v_subject, v_body);
  return new;
end;
$$;

drop trigger if exists trg_terms_receipt_email on public.terms_acceptances;
create trigger trg_terms_receipt_email
  after insert or update on public.terms_acceptances
  for each row execute function public.trg_terms_receipt_email();
