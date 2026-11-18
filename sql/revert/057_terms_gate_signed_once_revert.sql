-- Revert 057: put back the sql/031 body of has_accepted_current_terms(), which
-- asks whether the member has signed the NEWEST version.
begin;

create or replace function public.has_accepted_current_terms()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- With no version published there is nothing to accept, and the answer
  -- must be yes. Answering no would lock every member out of the platform the
  -- moment this function shipped ahead of the text it gates on - which is the
  -- first thing a draft of this function did.
  select case
    when not exists (select 1 from public.terms_versions) then true
    else exists (
      select 1
        from public.terms_acceptances a
        join public.profiles p on p.id = a.profile_id
       where p.user_id = auth.uid()
         and a.signed_name is not null
         and a.version = (select version from public.terms_versions
                           order by published_at desc limit 1)
    )
  end;
$$;

commit;
