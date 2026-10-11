-- 019_rate_limit_race.sql
--
-- Closes a hole in a prohibition. Item 46 of docs/CHECKLIST.md says one
-- account cannot flood the platform. It could.
--
-- Both rate limits counted rows and then compared:
--
--   select count(*) into v_recent from public.listings
--    where user_id = new.user_id and created_at > now() - interval '1 hour';
--   if v_recent >= v_limit then raise exception ...
--
-- Under READ COMMITTED - PostgreSQL's default, and Supabase's - a transaction
-- cannot see rows other transactions have not committed yet. So twenty-four
-- sessions inserting at the same instant each counted the same number, each
-- found itself under the limit, and all twenty-four were accepted. The limit
-- was not 20 an hour; it was 20 an hour per member who posts them one at a
-- time.
--
-- Found by scripts/stress-test.js on its first run: 24 parallel inserts, 24
-- accepted, 0 refused, 24 listings in the hour against a limit of 20. Nothing
-- in the browser or database suites could have caught it - both use a single
-- connection, and this bug does not exist on one connection.
--
-- The fix is a transaction-scoped advisory lock keyed on the member, taken
-- before the count. Sessions posting as the SAME member now queue behind each
-- other, so each one's count includes everything committed before it, and the
-- twenty-first is refused as intended. Sessions posting as different members
-- take different keys and never wait on one another, so this costs nothing in
-- ordinary use: the lock is only ever contended by one account trying to post
-- faster than the limit allows, which is exactly the case it exists to stop.
--
-- pg_advisory_xact_lock releases at the end of the transaction, whether it
-- commits or rolls back, so a failed insert cannot leave a member locked out.

begin;

create or replace function public.trg_limit_listing_rate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit constant int := 20;
  v_recent int;
begin
  if exists (select 1 from public.profiles p
              where p.id = new.user_id and p.role = 'operator') then
    return new;
  end if;

  -- Serialise this member's rate check against their own concurrent inserts.
  -- Two integers: a constant naming the check, and the member. Different
  -- members hash to different keys and do not wait on each other.
  perform pg_advisory_xact_lock(hashtext('jericho_listing_rate'), hashtext(new.user_id::text));

  select count(*) into v_recent
    from public.listings l
   where l.user_id = new.user_id
     and l.created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception
      'Rate limit: at most % listings per hour. Please wait before posting more.',
      v_limit
      using errcode = '53400';
  end if;

  return new;
end;
$function$;

create or replace function public.trg_limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit constant int := 30;
  v_recent int;
begin
  -- An Operator brokers every conversation on the platform; rate-limiting that
  -- would be rate-limiting the product.
  if exists (select 1 from public.profiles p
              where p.id = new.sender_id and p.role = 'operator') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('jericho_message_rate'), hashtext(new.sender_id::text));

  select count(*) into v_recent
    from public.messages m
   where m.sender_id = new.sender_id
     and m.created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception
      'Rate limit: at most % messages per hour. Please wait before sending more.',
      v_limit
      using errcode = '53400';
  end if;

  return new;
end;
$function$;

-- 017 revoked EXECUTE on every function in public and granted it back by name.
-- A trigger function is not in that list and does not need to be: PostgreSQL
-- checks EXECUTE on the trigger function against the role performing the
-- insert, and these two were never revoked from. Recreating them with CREATE
-- OR REPLACE keeps their existing grants, so nothing here reopens anything.

commit;
