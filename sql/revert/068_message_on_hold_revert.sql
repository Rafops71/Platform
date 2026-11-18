-- Revert of 068: messages.status goes back to the five values of sql/052, and record_activity() back to sql/051's list.
-- A message that is 'on_hold' at that moment returns to 'pending_review' first (the status the Operator found it in),
-- so the narrower check can be added; no message is deleted and no text changes.

begin;

update public.messages set status = 'pending_review' where status = 'on_hold';
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('pending_review','forwarded','replied','ignored','denied'));

create or replace function public.record_activity(
  p_action  text,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile uuid;
  v_role    text;
  v_status  text;
begin
  -- Status is NOT required here, deliberately (see sql/030).
  select p.id, p.role, p.status into v_profile, v_role, v_status
    from public.profiles p
   where p.user_id = auth.uid();

  if v_profile is null then
    raise exception 'Your account is not active on this platform.'
      using errcode = '42501';
  end if;

  if not (
       p_action = 'login'
    or (v_role = 'operator' and v_status = 'approved' and p_action in (
          'invitation_created', 'invitation_updated',
          'invitation_resent',  'invitation_deleted',
          'commodity_added',    'commodity_removed',
          'match_new',          'match_reviewed', 'match_dismissed',
          'message_forward_edited',
          'message_rewrite_requested'))
  ) then
    raise exception 'That is not an action this platform records.'
      using errcode = '22023';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile, p_action, p_details);
end;
$function$;

commit;
