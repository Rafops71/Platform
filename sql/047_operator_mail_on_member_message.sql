-- 047 (item 79): every approved Operator is emailed when a member sends a
-- message. The email carries no message content: it says a message is waiting
-- and asks the Operator to sign in. Operator messages do not trigger it, and
-- neither do messages from test accounts (reserved domains, see sql/027).
--
-- The template is ordinary data in email_templates (sql/008). It is English
-- only, because the Operator side is English only (owner's rule). Only this
-- one template is exempt from the both-languages check (E28, sql/tests/02).

insert into public.email_templates (template_key, lang, subject, body_text) values
('operator_new_message', 'en',
 'New message on MyPlatform',
 'A member has sent a new message on MyPlatform.' || E'\n\n' ||
 'Sign in to the Operator console to read it. This email does not contain the message.')
on conflict do nothing;

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

drop trigger if exists trg_mail_operators_new_member_message on public.messages;
create trigger trg_mail_operators_new_member_message
  after insert on public.messages
  for each row execute function public.trg_mail_operators_new_member_message();
