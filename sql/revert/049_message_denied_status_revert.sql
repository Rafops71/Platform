-- Reverts 049: removes 'denied' from the messages.status allowed list.
-- Refused, and changes nothing, while any row still holds 'denied': such a row
-- must be dealt with first, so the revert never rewrites or deletes it.

begin;

do $$
begin
  if exists (select 1 from public.messages where status = 'denied') then
    raise exception 'Revert 049 refused: messages with status denied still exist.';
  end if;
end
$$;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('pending_review','forwarded','replied','ignored'));

commit;
