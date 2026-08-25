#!/usr/bin/env bash
# Read-only verification of the LIVE Supabase database.
#
# Safe to run against production: it only SELECTs from catalog tables and
# counts rows. It creates nothing and changes nothing.
#
#   ./scripts/verify-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "ERROR: no .env — cp .env.example .env and fill it in." >&2; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a
[ -n "${SUPABASE_DB_URL:-}" ] || { echo "ERROR: SUPABASE_DB_URL empty in .env" >&2; exit 1; }

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
\timing off

\echo '=========== TABLES ==========='
select
  t.expected as table_name,
  case when c.relname is null then 'MISSING' else 'present' end as status,
  case when c.relrowsecurity then 'RLS on' else 'RLS OFF <-- PROBLEM' end as rls
from (values
  ('profiles'),('invitations'),('commodities'),('reference_counters'),
  ('listings'),('document_checklist'),('document_requests'),('messages'),
  ('message_forward_log'),('activity_log'),('matches'),('notifications')
) as t(expected)
left join pg_class c on c.relname = t.expected
  and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by t.expected;

\echo ''
\echo '=========== SECURITY FUNCTIONS ==========='
select f.expected as function_name,
       case when p.proname is null then 'MISSING' else 'present' end as status,
       case when p.prosecdef then 'definer' else 'invoker' end as security
from (values
  ('current_profile_id'),('is_operator'),('is_approved_participant'),
  ('handle_new_user'),('protect_profile_columns'),('protect_listing_columns'),
  ('protect_document_request_columns'),('get_invitation_by_token'),
  ('mark_invitation_used'),('next_reference'),('get_public_listings'),
  ('generate_matches_for_listing'),('send_listing_reminders'),('send_manual_reminder')
) as f(expected)
left join pg_proc p on p.proname = f.expected and p.pronamespace = 'public'::regnamespace
order by f.expected;

\echo ''
\echo '=========== TRIGGERS (002_updates applied?) ==========='
select t.expected as trigger_name,
       case when tg.tgname is null then 'MISSING <-- run 002_updates.sql' else 'present' end as status
from (values
  ('trg_protect_profile_columns'),('trg_protect_listing_columns'),
  ('trg_log_listing_change'),('trg_log_profile_change'),('trg_log_message_insert'),
  ('trg_notify_new_registration'),('trg_notify_new_listing'),
  ('trg_notify_listing_status'),('trg_notify_profile_approved'),
  ('on_listing_matchable')
) as t(expected)
left join pg_trigger tg on tg.tgname = t.expected and not tg.tgisinternal
order by t.expected;

\echo ''
\echo '=========== THE TWO BUG FIXES ==========='
select case when pg_get_functiondef(p.oid) like '%auth.uid() is null%'
            then 'FIXED — bootstrap exemption uses auth.uid()'
            when pg_get_functiondef(p.oid) like '%current_user in%'
            then 'NOT FIXED — still uses current_user (escalation risk); run 002_updates.sql'
            else 'UNKNOWN — inspect protect_profile_columns manually' end as "operator bootstrap fix"
from pg_proc p where p.proname='protect_profile_columns' and p.pronamespace='public'::regnamespace;

-- Postgres stores the PARSED expression and deparses it, dropping the
-- redundant 'public.' prefix — so the stored text reads 'messages.id', never
-- 'public.messages.id'. Test the semantics: correlating against messages.id
-- is right; correlating f.message_id against f.id is the bug.
select case when qual like '%f.message_id = messages.id%'
            then 'FIXED — messages_select correlates on messages.id'
            when qual like '%f.message_id = f.id%'
            then 'NOT FIXED — forwarded messages will not reach recipients; run 002_updates.sql'
            else 'UNKNOWN — inspect: select qual from pg_policies where policyname=''messages_select''' end
       as "mailbox forwarding fix"
from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_select';

\echo ''
\echo '=========== POLICY COUNT PER TABLE ==========='
select tablename, count(*) as policies
from pg_policies where schemaname='public' group by tablename order by tablename;

\echo ''
\echo '=========== DATA ==========='
select 'commodities' as item, count(*)::text as value from public.commodities
union all select 'commodities with sort_order', count(*)::text from public.commodities where sort_order is not null
union all select 'profiles', count(*)::text from public.profiles
union all select 'operators (role=operator, approved)', count(*)::text from public.profiles where role='operator' and status='approved'
union all select 'pending approvals', count(*)::text from public.profiles where status='pending'
union all select 'listings', count(*)::text from public.listings
union all select 'invitations (unused, unexpired)', count(*)::text from public.invitations where used_at is null and expires_at > now();

\echo ''
\echo '=========== OPERATOR ACCOUNTS ==========='
select email, role, status, created_at::date
from public.profiles where role='operator' order by created_at;
SQL
