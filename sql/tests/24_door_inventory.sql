-- 24_door_inventory.sql
--
-- Every door, read from the database's own catalogue and compared with an
-- approved list. Asked for on 2026-10-28 (ChatGPT's review, agreed by the
-- owner; docs/AGREED-2026-10-25.md): the security grid tries every door it
-- knows about, but a NEW table or function added without a lock would not be
-- known to it. These assertions fail on anything not on the list - so adding
-- a door means adding it here, on purpose, in the same change.

\set QUIET on
\pset pager off

\echo
\echo '=========== EVERY DOOR IS ON THE LIST ==========='

select case when count(*) = 0 then 'PASS'
            else 'FAIL no row-level security on: ' || string_agg(c.relname, ', ') end
  as "T1 every table in public has row-level security switched on"
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

with actual as (
  select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
), approved(name) as (values
  ('activity_log'), ('commodities'), ('deal_history'), ('deals'), ('document_checklist'),
  ('document_requests'), ('email_outbox'), ('email_phrases'), ('email_templates'),
  ('invitations'), ('listings'), ('matches'), ('message_forward_log'), ('messages'),
  ('notifications'), ('profiles'), ('reference_counters'), ('saved_searches'),
  ('terms_acceptances'), ('terms_versions')
), diff as (
  (select '+' || name d from actual except select '+' || name from approved)
  union all
  (select '-' || name from approved except select '-' || name from actual)
)
select case when count(*) = 0 then 'PASS'
            else 'FAIL tables not as approved (+ new, - missing): ' || string_agg(d, ', ' order by d) end
  as "T2 the tables are exactly the approved list"
from diff;

select case when count(*) = 0 then 'PASS'
            else 'FAIL views or materialised views, which skip row-level security by default: ' || string_agg(c.relname, ', ') end
  as "T3 there are no views in public"
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm');

select case when count(*) = 0 then 'PASS'
            else 'FAIL security-definer functions with no fixed search_path: ' || string_agg(p.proname, ', ') end
  as "T4 every security-definer function fixes its search_path"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.proname not like 'test\_%'
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');

-- Trigger functions are left out: they cannot be called as an API.
with actual as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and p.proname not like 'test\_%'
     and has_function_privilege('anon', p.oid, 'execute')
), approved(f) as (values
  ('current_profile_id()'), ('get_invitation_by_token(p_token text)'),
  ('is_approved_participant()'), ('is_operator()')
), diff as (
  (select '+' || f d from actual except select '+' || f from approved)
  union all
  (select '-' || f from approved except select '-' || f from actual)
)
select case when count(*) = 0 then 'PASS'
            else 'FAIL functions a stranger may call, not as approved: ' || string_agg(d, ', ' order by d) end
  as "T5 a stranger may call exactly the approved functions"
from diff;

with actual as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and p.proname not like 'test\_%'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')
), approved(f) as (values
  ('accept_terms(p_version text, p_language text, p_signed_name text, p_capacity text, p_company text, p_address_line1 text, p_address_line2 text, p_city text, p_postal_code text, p_country text)'),
  ('deal_analytics(p_bucket text, p_periods integer)'), ('get_public_listings()'),
  ('has_accepted_current_terms()'), ('looks_like_po_box(p text)'), ('mark_invitation_used(p_token text)'),
  ('member_scorecard(p_profile_id uuid)'), ('my_activity_export()'), ('next_reference(p_type text)'),
  ('operator_analytics(p_bucket text, p_periods integer)'), ('purge_orphaned_activity()'),
  ('queue_invitation_email(p_to_email text, p_link text, p_lang text)'),
  ('record_activity(p_action text, p_details jsonb)'), ('renew_listing(p_listing_id uuid)'),
  ('send_manual_reminder(p_listing_id uuid)')
), diff as (
  (select '+' || f d from actual except select '+' || f from approved)
  union all
  (select '-' || f from approved except select '-' || f from actual)
)
select case when count(*) = 0 then 'PASS'
            else 'FAIL functions only a signed-in caller may call, not as approved: ' || string_agg(d, ', ' order by d) end
  as "T6 a signed-in caller may call exactly the approved functions"
from diff;

select case when count(*) = 0 then 'PASS'
            else 'FAIL ' || string_agg(grantee || ' ' || privilege_type || ' on ' || table_name, ', ') end
  as "T7 no stranger or member holds TRUNCATE, REFERENCES or TRIGGER on any table"
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');
