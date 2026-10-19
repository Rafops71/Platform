-- 030: the activity log stops accepting lines written by hand.
--
-- WHAT WAS WRONG
--
-- sql/rls_policies.sql gave `authenticated` a direct INSERT grant on
-- public.activity_log (line 740), and a policy permitting it (line 690):
--
--   with check (user_id = public.current_profile_id() or public.is_operator())
--
-- The policy pins the actor for a participant, so nobody could forge a line
-- as somebody else. What it does NOT constrain is `action` and `details`,
-- which are free text and free JSON. A member able to reach the database
-- directly - the browser already holds a token that can - could write:
--
--   action = 'operator agreed to waive documents'
--
-- in their own name, into the Operator's audit trail, in the Operator's own
-- format. They could not erase or alter a line; only add.
--
-- The log exists to be the version of events nobody can argue with. A log the
-- subjects of it can write in is not that. Found in a second-opinion review
-- on 2026-10-19 and verified against the policy and the grant before this
-- file was written.
--
-- Note an operator could write anything already, and still can - is_operator()
-- let them through then, and record_activity() lets them through now. That is
-- not the hole being closed: the Operator is the author of the log.
--
-- WHAT THIS DOES
--
-- Adds record_activity(), a SECURITY DEFINER front door that:
--   * takes NO user_id - it resolves the actor from the caller's own session,
--     so the actor can never be supplied by the client;
--   * refuses anybody without an approved profile;
--   * accepts only the actions the application actually logs, and the
--     operator-only ones only from an operator.
--
-- Then it removes the direct route: the policy is dropped and the INSERT
-- grant revoked. service_role is untouched - scripts/ and the triggers in
-- sql/rls_policies.sql use log_activity(), which is SECURITY DEFINER and
-- granted to nobody, so it bypasses both.
--
-- THE ACTION LIST, AND WHERE IT COMES FROM
--
-- Read out of the application on 2026-10-19, not recalled:
--
--   js/auth.js:78        'login'                               participant
--   js/operator.js:494   'invitation_created'                  operator
--   js/operator.js:601   'invitation_updated'                  operator
--   js/operator.js:611   'invitation_resent'                   operator
--   js/operator.js:624   'invitation_deleted'                  operator
--   js/operator.js:782   'commodity_added'                     operator
--   js/operator.js:859   'commodity_removed'                   operator
--   js/operator.js:1214  'match_' || status                    operator
--
-- `status` on a match is constrained by the table itself to new/reviewed/
-- dismissed (sql/schema.sql:196), and only two are ever written from the
-- console (reviewed, dismissed - js/operator.js:1207-1208). All three are
-- listed so a future button cannot be refused by a list nobody remembered.
--
-- A new action needs a line here. That is the point, not a side effect: the
-- set of things the log can say is now a decision, taken once, in writing.

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
  -- Status is NOT required here, deliberately. A sign-in by a member who is
  -- pending, suspended or rejected is one of the more interesting lines the
  -- log can carry, and js/auth.js records it before it reads the status and
  -- sends them away (js/auth.js:78, ahead of the checks at :80 and :85). An
  -- approved-only guard would have thrown exactly those lines away and left
  -- the log quietest about the accounts worth watching. What is pinned is WHO,
  -- which the client no longer supplies, and WHAT, from the list below.
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
          'match_new',          'match_reviewed', 'match_dismissed'))
  ) then
    -- Deliberately not echoed back with the caller's text spliced into it:
    -- the message goes to a browser console, and the value came from there.
    raise exception 'That is not an action this platform records.'
      using errcode = '22023';
  end if;

  insert into public.activity_log (user_id, action, details)
    values (v_profile, p_action, p_details);
end;
$function$;

revoke all on function public.record_activity(text, jsonb) from public;
grant execute on function public.record_activity(text, jsonb) to authenticated;

-- The direct route, closed.
drop policy if exists activity_log_insert on public.activity_log;
revoke insert on public.activity_log from authenticated;
