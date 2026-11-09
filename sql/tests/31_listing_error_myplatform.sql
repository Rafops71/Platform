-- 31_listing_error_myplatform.sql
--
-- Proves sql/060 and its revert (owner's decision 2026-11-09: the listing-statements
-- error names MyPlatform, not Jericho):
--   * after 060 the function carries the new sentence and no old name;
--   * the function is the SAME function apart from that one sentence: its text is
--     identical once the sentence is swapped back, and its volatility, security
--     setting, search_path, owner, return type and grants are unchanged;
--   * the revert puts back the old sentence (the function exactly as sql/043 left it);
--   * the trigger that uses it is still in place after both;
--   * applying 060 again, after the revert, gives exactly the same function.
-- The migration and its revert are run from their own files (\i). The file ends with
-- 060 applied, as the rest of the suite expects. The behaviour itself (an offer more
-- than two steps from the principal is refused, the rest accepted) stays proven by
-- sql/tests/20_listing_statements.sql.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE LISTING-STATEMENTS ERROR SAYS MYPLATFORM ==========='

create temp table t31_new as
select pg_get_functiondef(p.oid) as def, p.provolatile, p.prosecdef, p.proconfig::text as cfg,
       p.proacl::text as acl, p.proowner::regrole::text as owner, p.prorettype::regtype::text as rt
  from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

select case when position('MyPlatform accepts offers no more than two steps from the principal. Please post only offers within that distance.' in def) > 0
             and def !~* 'jericho' then 'PASS' else 'FAIL' end
  as "T1 after 060 the function carries the new sentence and no old name"
from t31_new;

\i sql/revert/060_listing_error_myplatform_revert.sql

create temp table t31_old as
select pg_get_functiondef(p.oid) as def, p.provolatile, p.prosecdef, p.proconfig::text as cfg,
       p.proacl::text as acl, p.proowner::regrole::text as owner, p.prorettype::regtype::text as rt
  from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

select case when position('Jericho accepts offers no more than two steps from the principal. Please post only offers within that distance.' in def) > 0
            then 'PASS' else 'FAIL' end
  as "T2 after the revert the function carries the old sentence again"
from t31_old;

select case when replace(n.def, 'MyPlatform accepts offers no more than two steps', 'Jericho accepts offers no more than two steps') = o.def
            then 'PASS' else 'FAIL the two functions differ by more than the sentence' end
  as "T3 the new and old function are identical once the one sentence is swapped"
from t31_new n, t31_old o;

select case when n.provolatile = o.provolatile and n.prosecdef = o.prosecdef and n.cfg = o.cfg
              and n.acl is not distinct from o.acl and n.owner = o.owner and n.rt = o.rt
            then 'PASS' else 'FAIL' end
  as "T4 volatility, security setting, search_path, grants, owner and return type are unchanged"
from t31_new n, t31_old o;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T5 the trigger that uses the function is still in place after the revert"
from pg_trigger t where t.tgname = 'trg_enforce_listing_statements' and not t.tgisinternal;

\i sql/060_listing_error_myplatform.sql

select case when pg_get_functiondef(p.oid) = (select def from t31_new)
            then 'PASS' else 'FAIL' end
  as "T6 after revert and re-apply the function is exactly what 060 first produced"
from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

\i sql/060_listing_error_myplatform.sql

select case when pg_get_functiondef(p.oid) = (select def from t31_new)
            then 'PASS' else 'FAIL' end
  as "T7 applying 060 a second time changes nothing (idempotent)"
from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 the trigger is still in place after the re-apply"
from pg_trigger t where t.tgname = 'trg_enforce_listing_statements' and not t.tgisinternal;
