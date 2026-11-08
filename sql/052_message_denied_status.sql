-- 052: a message the Operator denies (it held contact details and the member
-- was asked to rewrite it) gets the status 'denied'. It stays visible to the
-- Operator, read-only, and is never delivered. This ADDS one value to the
-- messages.status allowed list (sql/schema.sql). No existing row changes.

begin;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('pending_review','forwarded','replied','ignored','denied'));

commit;
