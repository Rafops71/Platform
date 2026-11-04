-- Reverts 047: removes the trigger, its function and the template rows.
drop trigger if exists trg_mail_operators_new_member_message on public.messages;
drop function if exists public.trg_mail_operators_new_member_message();
delete from public.email_templates where template_key = 'operator_new_message';
