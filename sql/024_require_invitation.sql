-- 024_require_invitation.sql
--
-- Makes "invitation only" true of the SYSTEM rather than of the web page.
--
-- THE HOLE
--
-- Verified on the live project on 2026-10-12:
--
--     disable_signup      false      the sign-up endpoint is open to anyone
--     mailer_autoconfirm  true       and the address need not even be real
--
-- and handle_new_user() asked for no invitation at all. So anybody who read
-- the page source - where the publishable key lives, correctly and by design -
-- could POST to /auth/v1/signup and get an account. It would sit at 'pending'
-- and see nothing, because RLS holds; but it would create a profile, a Terms
-- acceptance recorded as 'unrecorded', and an activity row, and it would land
-- in the Operator's Approvals screen. One line of script could fill that
-- screen with thousands.
--
-- The first line of this product is that it is private and invitation-only.
-- That was enforced by a web page, which is to say not enforced. The suites
-- never saw it because every test walked the invited path; nothing ever tried
-- the path nobody intended.
--
-- THE RULE
--
-- A new account is allowed only when an invitation exists for that email
-- address, unused and unexpired. The invitation is CONSUMED in the same
-- transaction that creates the profile, so one invitation can produce exactly
-- one account - two simultaneous signups on the same token cannot both win,
-- because the UPDATE ... WHERE used_at IS NULL either matches a row or does
-- not, inside one transaction.
--
-- THE ONE EXEMPTION, AND WHY IT IS SAFE
--
-- An empty database has no invitations and nobody to write one: the first
-- Operator cannot be invited by anybody. So a signup is allowed when
-- public.profiles is EMPTY, and only then.
--
-- This closes itself. The moment that first account exists the exemption is
-- gone forever, because profiles is no longer empty. On the live project it
-- was already closed before this file was written - three profiles existed -
-- so there is no window during which it is open to anyone.
--
-- It is also what lets the test suites build a world from nothing: a throwaway
-- database starts empty, its first account becomes the Operator, and that
-- Operator invites everybody else, which is the real flow rather than a
-- special case for tests.
--
-- WHAT THIS DOES NOT DO
--
-- It does not close /auth/v1/signup. A stranger can still make the request;
-- they just get an error and no account. Closing the endpoint itself means
-- moving registration to a server-side function, which is a larger change -
-- recorded in HANDOFF.md as the next step, not pretended to be done here.

begin;

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
  -- Is this the very first account on an empty database?
  select not exists (select 1 from public.profiles) into v_bootstrap;

  if not v_bootstrap then
    -- Claim an invitation for this address, and consume it in the same
    -- breath. `for update skip locked` so two signups racing on one address
    -- cannot both claim the same row: the loser sees no row and is refused.
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
      -- Deliberately says nothing about WHY. "No invitation for this address"
      -- and "that invitation has expired" are both answers to the question
      -- "is this person a member here", which is the question this platform
      -- exists not to answer.
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
    'participant',   -- hardcoded, never taken from client input
    'pending',       -- hardcoded, never taken from client input
    public.norm_lang(new.raw_user_meta_data->>'language')
  )
  returning id into v_profile_id;

  -- Now that the profile exists, record who used the invitation. Done here
  -- rather than in the UPDATE above because used_by references profiles(id),
  -- which did not exist yet when the invitation was claimed.
  if v_invitation_id is not null then
    update public.invitations
       set used_by = v_profile_id
     where id = v_invitation_id;
  end if;

  -- 'unrecorded' rather than skipping the insert: a missing row is ambiguous
  -- (did they not accept, or did the record fail?), whereas a row saying
  -- 'unrecorded' is unambiguous evidence that a registration arrived without a
  -- version attached, and an Operator can see it.
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

commit;
