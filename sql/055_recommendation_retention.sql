-- 055: retention for candidate recommendations (owner's decision, 2026-11-08).
--
-- A recommendation's details (candidate name, company, email, how known,
-- commodities, own experience) are deleted 12 months after it is CLOSED.
-- Closed means:
--   declined                                  -> at decided_at
--   invited, its invitation was deleted       -> at decided_at
--   invited, its invitation was used          -> at used_at
--   invited, its invitation expired unused    -> at expires_at
-- An open recommendation, or an invitation still waiting to be used and not
-- yet expired, is never closed and never purged.
--
-- NOT PURGED HERE, and flagged to the owner: the invitations row itself (it
-- holds the candidate's email and token) and the outbox emails already sent.
-- Those are other tables with their own history rules.
--
-- WARNING: this function DELETES data. Its revert cannot restore the rows it
-- has removed: sql/revert/055 only removes the function.
--
-- Nothing runs this by itself. It is scheduled only when the owner says so,
-- see the report. It is callable by service_role alone, so no signed-in
-- member and no Operator can run it from the app.

begin;

create or replace function public.purge_closed_candidate_recommendations(
  p_as_of timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with closed as (
    select r.id,
           case
             when r.status = 'declined' then r.decided_at
             when r.status = 'invited' and r.invitation_id is null then r.decided_at
             when r.status = 'invited' and i.used_at is not null then i.used_at
             when r.status = 'invited' and i.expires_at <= p_as_of then i.expires_at
             else null
           end as closed_at
      from public.candidate_recommendations r
      left join public.invitations i on i.id = r.invitation_id
  ), doomed as (
    delete from public.candidate_recommendations r
     using closed c
     where r.id = c.id
       and c.closed_at is not null
       and c.closed_at <= p_as_of - interval '12 months'
    returning r.id
  )
  select count(*)::integer into v_deleted from doomed;

  return v_deleted;
end;
$$;

revoke execute on function public.purge_closed_candidate_recommendations(timestamptz) from public, anon, authenticated;
grant  execute on function public.purge_closed_candidate_recommendations(timestamptz) to service_role;

commit;
