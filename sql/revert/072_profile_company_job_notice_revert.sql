-- Revert of sql/072: puts back sql/011's version of the function (names of changed fields only, never values).
-- Entries already written stay in the log. No member's data is involved. Safe to run twice.
begin;
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

  return new;
end;
$$;
commit;
