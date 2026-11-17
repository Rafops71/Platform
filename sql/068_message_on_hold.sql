-- 068: "Please reconcile" (owner's idea 4, mockup approved 17 Nov 2026; Item 78 is the mirror, no item of its own).
-- applied-probe: select exists(select 1 from pg_constraint where conname = 'messages_status_check' and pg_get_constraintdef(oid) like '%on_hold%') and position('message_reconcile_requested' in pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure)) > 0
--
-- WHAT IT ADDS (nothing is removed, no row changes):
--   1. messages.status may also be 'on_hold': the Operator asked the member to reconcile a message with an
--      earlier dated statement; the message is NOT forwarded, and is not "denied" (it may be forwarded after the
--      member answers). The check keeps its four older values exactly (sql/052).
--   2. record_activity() accepts one more action name for an approved Operator, 'message_reconcile_requested'.
--      The body is the one sql/051 wrote, which live holds today (read back 17 Nov), plus that one name.
--
-- Revert: sql/revert/068_message_on_hold_revert.sql. Proof: sql/tests/39_message_on_hold.sql.

begin;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('pending_review','forwarded','replied','ignored','denied','on_hold'));

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
          'message_rewrite_requested',
          'message_reconcile_requested'))
  ) then
    raise exception 'That is not an action this platform records.'
      using errcode = '22023';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile, p_action, p_details);
end;
$function$;

commit;
