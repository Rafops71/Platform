-- Revert of 067: the Terms-receipt trigger as sql/048 first wrote it (only the 'jericho-e2e-%' marker).

begin;

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

commit;
