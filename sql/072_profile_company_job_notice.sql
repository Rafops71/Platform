-- 072: the Operator is told when a member changes company or job title (owner, 19 Nov 2026; docs/AGREED-2026-11-19-batch2.md point 5).
-- applied-probe: select pg_get_functiondef('public.trg_log_profile_change()'::regprocedure) like '%profile_company_changed%'
--
-- WHAT IT DOES. trg_log_profile_change() (sql/011) already writes one 'profile_updated' entry naming the fields that changed,
-- never their values. This replaces it with the same function plus two more entries: 'profile_company_changed' and
-- 'profile_job_title_changed', each with details {profile_id, from, to}. The Operator's Activity screen already lists every
-- activity_log row, so they appear there with no screen change. Nothing is blocked: an after-update trigger that only logs.
-- The trigger itself (trg_log_profile_change on profiles) is not touched; only the function body.
-- NOTE for the owner: this puts the old and new company and job title into the audit trail. 011 had deliberately kept values
-- out; the owner's decision for these two fields overrides that. Phone, names and the rest stay out.
create or replace function public.trg_log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
begin
  if new.status is distinct from old.status then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'user_status_changed',
              jsonb_build_object('profile_id', new.id, 'email', new.email,
                                 'from', old.status, 'to', new.status));
  end if;
  if new.role is distinct from old.role then
    insert into public.activity_log (user_id, action, details)
      values (public.current_profile_id(), 'user_role_changed',
              jsonb_build_object('profile_id', new.id, 'email', new.email,
                                 'from', old.role, 'to', new.role));
  end if;

  if new.first_name is distinct from old.first_name then v_changed := array_append(v_changed, 'first_name'); end if;
  if new.last_name  is distinct from old.last_name  then v_changed := array_append(v_changed, 'last_name');  end if;
  if new.company    is distinct from old.company    then v_changed := array_append(v_changed, 'company');    end if;
  if new.country    is distinct from old.country    then v_changed := array_append(v_changed, 'country');    end if;
  if new.phone      is distinct from old.phone      then v_changed := array_append(v_changed, 'phone');      end if;
  if new.job_title  is distinct from old.job_title  then v_changed := array_append(v_changed, 'job_title');  end if;
  if new.language   is distinct from old.language   then v_changed := array_append(v_changed, 'language');   end if;

  if array_length(v_changed, 1) > 0 then
    insert into public.activity_log (user_id, action, details)
      values (coalesce(public.current_profile_id(), new.id), 'profile_updated',
              jsonb_build_object('profile_id', new.id, 'fields', to_jsonb(v_changed)));
  end if;

  -- The owner's decision (19 Nov 2026, batch 2 point 5): a change of company or job title tells the Operator, WITH the old and
  -- the new value, as its own entry. Nothing is blocked. 'profile_updated' above is unchanged and still never carries values.
  -- Only these two fields: names, phone and the rest are never copied into the log. The log is Operator-only to read
  -- (activity_log_select), and my_activity_export() lists only profile_updated, email_changed and password_changed, so
  -- these entries are in nothing a member can open.
  if new.company is distinct from old.company then
    insert into public.activity_log (user_id, action, details)
      values (coalesce(public.current_profile_id(), new.id), 'profile_company_changed',
              jsonb_build_object('profile_id', new.id, 'from', old.company, 'to', new.company));
  end if;
  if new.job_title is distinct from old.job_title then
    insert into public.activity_log (user_id, action, details)
      values (coalesce(public.current_profile_id(), new.id), 'profile_job_title_changed',
              jsonb_build_object('profile_id', new.id, 'from', old.job_title, 'to', new.job_title));
  end if;

  return new;
end;
$$;
