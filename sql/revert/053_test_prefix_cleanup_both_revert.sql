-- Reverts 053: restores the sql/027 purge and the sql/047 test-mail skip rule
-- to their old-prefix-only form. Nothing is deleted and no row is changed.

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_activity integer;
  v_notifications integer;
  v_mail integer;
  v_total integer;
begin
  -- Operators only, and only Operators who are still active (sql/026).
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator'
                    and p.status = 'approved') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

  -- 1. The audit trail. Unchanged from 021.
  delete from public.activity_log a
   where a.user_id is null
     and (
       (jsonb_exists(a.details, 'profile_id')
         and not exists (select 1 from public.profiles p
                          where p.id = (a.details->>'profile_id')::uuid))
       or
       (jsonb_exists(a.details, 'listing_id')
         and not exists (select 1 from public.listings l
                          where l.id = (a.details->>'listing_id')::uuid))
     );
  get diagnostics v_activity = row_count;

  -- 2. The Operator feed. Unchanged from 023.
  delete from public.notifications n
   where n.related_id is not null
     and not exists (select 1 from public.listings l where l.id = n.related_id)
     and not exists (select 1 from public.profiles p where p.id = n.related_id)
     and not exists (select 1 from public.messages m where m.id = n.related_id);
  get diagnostics v_notifications = row_count;

  -- 3. Mail that was never going to reach anybody. New in 027.
  delete from public.email_outbox e
   where e.sent_at is null
     and (e.to_email like 'jericho-e2e-%'
       or e.to_email like '%@example.invalid'
       or e.to_email like '%@example.com'
       or e.to_email like '%@example.org'
       or e.to_email like '%@example.net');
  get diagnostics v_mail = row_count;

  v_total := v_activity + v_notifications + v_mail;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_total,
                               'activity_log', v_activity,
                               'notifications', v_notifications,
                               'test_mail', v_mail));

  return v_total;
end;
$$;

create or replace function public.trg_mail_operators_new_member_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_email   text;
  v_subject text;
  v_body    text;
  r         record;
begin
  select p.role, p.email into v_role, v_email from public.profiles p where p.id = new.sender_id;
  if v_role is distinct from 'participant' then return new; end if;

  -- Test accounts send no Operator mail. The marker is the one sql/027 uses to
  -- decide what is test mail: the reserved domains (RFC 2606) and the e2e prefix.
  -- Nothing is deleted; the trigger simply does not queue these.
  if v_email ~* '@example\.(invalid|com|org|net)$' or lower(v_email) like 'jericho-e2e-%' then
    return new;
  end if;

  select t.subject, t.body_text into v_subject, v_body
    from public.render_email('operator_new_message', 'en', '{}'::jsonb) t;

  for r in
    select p.email from public.profiles p
     where p.role = 'operator' and p.status = 'approved' and p.email is not null
  loop
    insert into public.email_outbox (to_email, subject, body_text)
      values (r.email, v_subject, v_body);
  end loop;
  return new;
end;
$$;

-- Restores the sql/048 receipt email function exactly (the terms-3-6 branch).
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

