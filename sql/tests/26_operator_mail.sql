-- 26_operator_mail.sql
--
-- Proves sql/047 (item 79): when a member sends a message, every approved
-- Operator gets one email; a pending Operator gets none; the email holds none
-- of the message; an Operator's own message sends nothing; and the trigger is
-- still live after that.

\set QUIET on
\pset pager off

\echo
\echo '=========== AN OPERATOR IS EMAILED, WITHOUT CONTENT ==========='

select public.test_invite('mail-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('d4d4d4d4-0001-0001-0001-000000000001'::uuid, 'mail-op@example.invalid',
  jsonb_build_object('first_name','Olga','last_name','Mailer','phone','+3200000401',
                     'country','Chile','language','en'));
select public.test_invite('mail-op2@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('d4d4d4d4-0003-0003-0003-000000000003'::uuid, 'mail-op2@example.invalid',
  jsonb_build_object('first_name','Pia','last_name','Mailer','phone','+3200000403',
                     'country','Chile','language','en'));
select public.test_invite('mail-pending-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('d4d4d4d4-0004-0004-0004-000000000004'::uuid, 'mail-pending-op@example.invalid',
  jsonb_build_object('first_name','Pete','last_name','Mailer','phone','+3200000404',
                     'country','Chile','language','en'));
select public.test_invite('mail-member@mailcheck-platform.com');
select public.test_invite('jericho-e2e-mail@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('d4d4d4d4-0005-0005-0005-000000000005'::uuid, 'jericho-e2e-mail@example.invalid',
  jsonb_build_object('first_name','Test','last_name','Account','phone','+3200000405',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email = 'jericho-e2e-mail@example.invalid';
insert into auth.users (id, email, raw_user_meta_data)
values ('d4d4d4d4-0002-0002-0002-000000000002'::uuid, 'mail-member@mailcheck-platform.com',
  jsonb_build_object('first_name','Mike','last_name','Mailer','phone','+3200000402',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email in
  ('mail-op@example.invalid', 'mail-op2@example.invalid', 'mail-member@mailcheck-platform.com');
update public.profiles set status = 'approved', role = 'operator'
 where email in ('mail-op@example.invalid', 'mail-op2@example.invalid');
update public.profiles set role = 'operator' where email = 'mail-pending-op@example.invalid';

delete from public.email_outbox where to_email like 'mail-%@example.invalid';

insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'mail-member@mailcheck-platform.com'),
        'SECRET-TEXT-79 a member writes something private', 'pending_review');

select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T1 Item79 one approved Operator is emailed when a member sends a message"
from public.email_outbox
where to_email = 'mail-op@example.invalid' and subject = 'New message on MyPlatform';

select case when count(*) = 1 then 'PASS' else 'FAIL ' || count(*) end
  as "T2 Item79 every approved Operator is emailed, one email each"
from public.email_outbox
where to_email = 'mail-op2@example.invalid' and subject = 'New message on MyPlatform';

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end
  as "T3 Item79 a pending Operator is not emailed"
from public.email_outbox
where to_email = 'mail-pending-op@example.invalid';

select case when count(*) = 0 then 'PASS' else 'FAIL the message text reached the email' end
  as "T4 Item79 the email carries none of the message"
from public.email_outbox
where to_email like 'mail-%@example.invalid' and body_text like '%SECRET-TEXT-79%';

delete from public.email_outbox where to_email like 'mail-%@example.invalid';

insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'mail-op@example.invalid'),
        'an Operator writes a reply', 'pending_review');

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end
  as "T5 Item79 an Operator's own message sends no email"
from public.email_outbox
where to_email like 'mail-%@example.invalid';

insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'mail-member@mailcheck-platform.com'),
        'a second member message, after the Operator one', 'pending_review');

select case when count(*) = 2 then 'PASS' else 'FAIL ' || count(*) end
  as "T6 Item79 the trigger still fires for the next member message"
from public.email_outbox
where to_email in ('mail-op@example.invalid', 'mail-op2@example.invalid');

-- A test account's message sends no Operator mail (sql/047). Nothing is
-- deleted to prove it: the outbox is clean before this message.
delete from public.email_outbox where to_email like 'mail-%@example.invalid';
insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'jericho-e2e-mail@example.invalid'),
        'a message from a test account', 'pending_review');

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) end
  as "T7 Item79 a test account's message queues no Operator email"
from public.email_outbox
where to_email like 'mail-%@example.invalid';
