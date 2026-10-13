-- The way back from sql/024_require_invitation.sql.
--
-- This is the handle_new_user() that was live on the Supabase project
-- immediately before 024 was applied, read out of the live database with
-- pg_get_functiondef() on 2026-10-13 - not reconstructed from memory or from
-- an older file in this repository.
--
-- Running this file returns registration to the behaviour it had before:
-- anybody who can reach /auth/v1/signup gets a pending profile. That is the
-- hole 024 closes, so this is a rollback for an emergency - a real member
-- unable to register when nobody is awake to invite them - and not a thing to
-- run casually.
--
-- It exists because of the standing rule on this project: never change a live
-- system until the way back is proven. The way back is this file.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile_id uuid;
begin
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
