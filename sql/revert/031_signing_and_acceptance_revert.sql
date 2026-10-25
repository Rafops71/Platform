-- Revert 031. Restores what the LIVE database held on 2026-10-25, read with
-- pg_get_functiondef / pg_policies / pg_constraint before 031 was written -
-- not reconstructed from memory.
--
-- ORDER MATTERS. Rows whose profile was deleted while 031 was in force have
-- profile_id NULL; the original column was NOT NULL. Those rows are the
-- evidence 031 exists to keep, so this revert REFUSES to run while any exist,
-- rather than deleting them to make the constraint fit.
--
-- Columns added by 031 are left in place: dropping them would destroy
-- signatures already recorded. Reverting the behaviour does not require
-- destroying the evidence.

begin;

do $$ begin
  if exists (select 1 from public.terms_acceptances where profile_id is null) then
    raise exception 'Refusing to revert 031: % acceptance(s) belong to deleted members and would have to be destroyed. Export them first.',
      (select count(*) from public.terms_acceptances where profile_id is null);
  end if;
end $$;

-- handle_new_user, exactly as live before 031 (identical to sql/024).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_invitation_id uuid;
  v_bootstrap boolean;
begin
  select not exists (select 1 from public.profiles) into v_bootstrap;

  if not v_bootstrap then
    update public.invitations i
       set used_at = now()
     where i.id = (
       select i2.id
         from public.invitations i2
        where lower(i2.email) = lower(new.email)
          and i2.used_at is null
          and i2.expires_at > now()
        order by i2.created_at
        limit 1
        for update skip locked
     )
    returning i.id into v_invitation_id;

    if v_invitation_id is null then
      raise exception 'Registration is by invitation only.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.profiles (user_id, first_name, last_name, company, email, phone, country, role, status, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'company',
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'country', ''),
    'participant',
    'pending',
    public.norm_lang(new.raw_user_meta_data->>'language')
  )
  returning id into v_profile_id;

  if v_invitation_id is not null then
    update public.invitations
       set used_by = v_profile_id
     where id = v_invitation_id;
  end if;

  insert into public.terms_acceptances (profile_id, version, language)
  values (
    v_profile_id,
    coalesce(nullif(new.raw_user_meta_data->>'terms_version', ''), 'unrecorded'),
    public.norm_lang(new.raw_user_meta_data->>'terms_language')
  );

  perform public.log_activity(
    v_profile_id,
    'user_registered',
    jsonb_build_object('email', lower(new.email))
  );

  return new;
end;
$function$;

drop function if exists public.accept_terms(text,text,text,text,text,text,text,text,text,text);
drop function if exists public.has_accepted_current_terms();

-- The direct insert route, as live before 031.
drop policy if exists terms_acceptances_insert on public.terms_acceptances;
create policy terms_acceptances_insert on public.terms_acceptances for insert
  with check (profile_id = public.current_profile_id());
grant insert on public.terms_acceptances to authenticated;

-- CASCADE and NOT NULL, as live before 031.
alter table public.terms_acceptances drop constraint if exists terms_acceptances_profile_id_fkey;
alter table public.terms_acceptances
  add constraint terms_acceptances_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.terms_acceptances alter column profile_id set not null;

commit;
