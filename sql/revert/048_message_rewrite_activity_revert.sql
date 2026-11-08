-- Reverts 048: restores the record_activity() allowlist from sql/046 (without
-- 'message_rewrite_requested'). Existing rows are left alone.
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
          'message_forward_edited'))
  ) then
    raise exception 'That is not an action this platform records.'
      using errcode = '22023';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile, p_action, p_details);
end;
$function$;
