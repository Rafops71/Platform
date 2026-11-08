-- 057: a member who has signed the Terms once is never held at sign-in again
-- when the Terms change (checklist Item 62, owner-approved 2026-11-08).
--
-- Before this, has_accepted_current_terms() asked whether the member had signed
-- the NEWEST version. A new version therefore held every member until they
-- signed it again. Now it asks whether the member has signed any version. A
-- member who has never signed is still held, as before: signing once, at
-- joining, is still required.
--
-- is_approved_participant() (sql/034) uses this function, so the same change
-- applies to every action a member takes, not only the sign-in screen.
-- Only the body changes; the grants from sql/031 are kept by create or replace.
-- Revert: sql/revert/057_terms_gate_signed_once_revert.sql (restores sql/031).

begin;

create or replace function public.has_accepted_current_terms()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- With no version published there is nothing to accept, and the answer
  -- must be yes (see sql/031).
  select case
    when not exists (select 1 from public.terms_versions) then true
    else exists (
      select 1
        from public.terms_acceptances a
        join public.profiles p on p.id = a.profile_id
       where p.user_id = auth.uid()
         and a.signed_name is not null
    )
  end;
$$;

commit;
