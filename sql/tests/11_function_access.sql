-- 11_function_access.sql
--
-- Proves sql/017 did what it claims: a caller with no account can reach exactly
-- one function, and the audit trail cannot be written by hand.
--
-- These are the only assertions in the suite about *who may call* a function
-- rather than what it returns. They matter because the hole they close was not
-- a bug in any function's logic — every function behaved exactly as written.
-- It was the door being open, which no test about behaviour would ever notice.

\set QUIET on
\pset pager off

\echo
\echo '=========== WHO MAY CALL A FUNCTION ==========='

-- A stranger reaching the trading book was the live leak. Browse withholds the
-- poster's identity and nothing else, so one unauthenticated call returned
-- every listing's specification, price conditions, notes and exact origin.
select case when has_function_privilege('anon', 'public.get_public_listings()', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T1 Item51 a caller with no account cannot read the listings";

select case when has_function_privilege('anon', 'public.my_activity_export()', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T2 Item51 nor call the activity export";

select case when has_function_privilege('anon', 'public.operator_analytics(text, integer)', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T3 Item51 nor the Operator figures";

select case when has_function_privilege('anon', 'public.queue_invitation_email(text, text, text)', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T4 Item51 nor make the platform send an email";

-- log_activity takes the user_id from its caller and writes it unchecked, so an
-- open grant meant anybody could forge an entry against any member. The audit
-- trail is the Operator's record of who did what; a forgeable one is worse than
-- none, because it is believed.
select case when has_function_privilege('anon', 'public.log_activity(uuid, text, jsonb)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.log_activity(uuid, text, jsonb)', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T5 Item52 the audit log cannot be written by hand, by anyone";

select case when has_function_privilege('anon', 'public.notify_operators(text, text, uuid)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.notify_operators(text, text, uuid)', 'EXECUTE')
            then 'FAIL' else 'PASS' end
  as "T6 Item52 nor the Operator notification feed";

\echo
\echo '=========== WHAT MUST STILL WORK ==========='

-- The other half of the test. A lockdown that also locks out the registration
-- page is not a fix, and this is the assertion that would have caught it:
-- opening an invitation link happens before any account exists.
select case when has_function_privilege('anon', 'public.get_invitation_by_token(text)', 'EXECUTE')
            then 'PASS' else 'FAIL' end
  as "T7 Item51 a stranger CAN still have their invitation token checked";

select case when has_function_privilege('authenticated', 'public.get_public_listings()', 'EXECUTE')
            then 'PASS' else 'FAIL' end
  as "T8 Item18 a signed-in member can still browse";

select case when has_function_privilege('authenticated', 'public.renew_listing(uuid)', 'EXECUTE')
            then 'PASS' else 'FAIL' end
  as "T9 Item37 and still renew their own listing";

select case when has_function_privilege('authenticated', 'public.my_activity_export()', 'EXECUTE')
            then 'PASS' else 'FAIL' end
  as "T10 Item34 and still export their own record";

-- The RLS policies call these on every row they check. Revoking them would not
-- deny access, it would make the policy itself raise — so a page that reads a
-- table before sign-in would break rather than show nothing.
select case when has_function_privilege('anon', 'public.is_operator()', 'EXECUTE')
             and has_function_privilege('anon', 'public.current_profile_id()', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.is_operator()', 'EXECUTE')
            then 'PASS' else 'FAIL' end
  as "T11 Item50 the row rules can still be evaluated for both roles";

-- Guards against the most likely way this regresses: someone adds a function in
-- a later migration and PostgreSQL hands PUBLIC the keys again.
select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(p.proname, ', ') end
  as "T12 Item51 no function in public is executable by PUBLIC"
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.prorettype <> 'trigger'::regtype
  and p.proacl is not null
  and exists (
    select 1 from aclexplode(p.proacl) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'   -- grantee 0 is PUBLIC
  );
