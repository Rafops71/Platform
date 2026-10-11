-- 017_lock_down_function_access.sql
--
-- Closes a live hole. PostgreSQL grants EXECUTE on a new function to PUBLIC
-- unless told otherwise, and nothing in this project ever told it otherwise, so
-- all 41 functions inherited it. Every SECURITY DEFINER function — which runs
-- with the owner's rights and therefore past Row Level Security — was callable
-- by the `anon` role, meaning by anybody at all.
--
-- The site is published at https://rafops71.github.io/Platform/ and carries the
-- publishable key in its source, as a browser client must. Anyone could lift
-- that key and call these functions directly. Two mattered:
--
--   get_public_listings()  — returned every non-archived listing, with
--                            specification, price_conditions, notes and the
--                            exact origin, to a caller with no account. On a
--                            platform whose product is controlled disclosure,
--                            that is the trading book in the open. Confirmed by
--                            running it as the anon role against live: it
--                            returned a real row.
--   log_activity()         — inserts into the audit trail whatever user_id,
--                            action and details the caller passes, with no
--                            check at all. A stranger could forge history,
--                            attribute actions to any member, or flood it.
--
-- Also reachable, less serious: notify_operators() to spam the Operator feed,
-- next_reference() to burn reference numbers, email_phrase() to read the
-- translation dictionary. The important ones held: queue_invitation_email
-- demands is_operator(), operator_analytics raises 'Operators only',
-- renew_listing and my_activity_export resolve auth.uid() and find nothing.
--
-- Table privileges are left exactly as they are. Supabase grants anon and
-- authenticated full table rights by design and relies on RLS to decide what
-- each one may actually see; changing that is a different and much riskier
-- piece of work. This file only governs who may CALL a function.

begin;

-- ---------------------------------------------------------------------------
-- 1. Take the blanket grant away.
-- ---------------------------------------------------------------------------
-- Trigger functions are skipped: the trigger machinery does not consult
-- EXECUTE, so revoking changes nothing for them, and listing them would only
-- make this harder to read. service_role and postgres keep their own explicit
-- grants — they are the server-side identities and are not being narrowed.
do $$
declare
  fn record;
  n  integer := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'revoked execute on % functions from public, anon and authenticated', n;
end $$;

-- Future functions must not inherit it either. Without this, the next migration
-- that adds a SECURITY DEFINER function silently reopens the hole.
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. Give it back, deliberately, to exactly what is used.
-- ---------------------------------------------------------------------------
-- Derived from the front end, not guessed: these are every function reached by
-- a `.rpc(...)` call in js/, plus the three predicates the RLS policies
-- themselves call.

-- The policy predicates. Both roles need these: Supabase grants anon table
-- rights and leaves RLS to refuse the rows, so a policy is still evaluated for
-- an anonymous caller. Without EXECUTE that evaluation errors instead of
-- quietly returning nothing — a worse answer, and one that would break pages
-- that read a table before sign-in.
grant execute on function public.current_profile_id()        to anon, authenticated;
grant execute on function public.is_operator()               to anon, authenticated;
grant execute on function public.is_approved_participant()    to anon, authenticated;

-- The one thing a stranger legitimately does: open their invitation link and
-- have the token checked, before any account exists. js/auth.js:110.
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- Signed in, any member.
grant execute on function public.get_public_listings()        to authenticated;
grant execute on function public.my_activity_export()          to authenticated;
grant execute on function public.renew_listing(uuid)           to authenticated;
grant execute on function public.next_reference(text)          to authenticated;
-- Consumed immediately after sign-up, when a session already exists
-- (js/auth.js:195 runs after signUp returns), so authenticated is enough.
grant execute on function public.mark_invitation_used(text)    to authenticated;

-- Operator screens. These defend themselves internally as well — the grant is
-- the outer door, is_operator() is the inner one, and both stay.
grant execute on function public.operator_analytics(text, integer)          to authenticated;
grant execute on function public.send_manual_reminder(uuid)                 to authenticated;
grant execute on function public.queue_invitation_email(text, text, text)    to authenticated;

-- Deliberately NOT granted to anyone: log_activity, notify_operators,
-- generate_matches_for_listing, render_email, email_phrase, norm_lang,
-- rls_auto_enable, send_listing_reminders, handle_new_user and every
-- protect_*/trg_*/stamp_* body. Nothing in js/ calls them; they are reached
-- from triggers and from other functions, which do not need a grant. If a
-- future screen needs one, add a line here rather than widening the default.

-- ---------------------------------------------------------------------------
-- 3. Pin the search_path on the three functions that lacked it.
-- ---------------------------------------------------------------------------
-- Flagged by Supabase's linter. A SECURITY DEFINER function without a fixed
-- search_path can be made to resolve a table name somewhere the caller
-- controls. These three are the only ones left without it.
alter function public.norm_lang(text)              set search_path = public;
alter function public.stamp_message_reviewed()      set search_path = public;
alter function public.stamp_match_reviewed()        set search_path = public;

commit;
