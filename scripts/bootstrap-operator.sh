#!/usr/bin/env bash
# Promote a registered user to Operator on the live database.
#
#   ./scripts/bootstrap-operator.sh                    # uses OPERATOR_EMAIL from .env
#   ./scripts/bootstrap-operator.sh someone@example.com
#
# The user must already have REGISTERED through the app — this promotes an
# existing profile, it does not create an account. (Nothing can self-register
# as an Operator; that is the point.)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "ERROR: no .env — cp .env.example .env and fill it in." >&2; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a
[ -n "${SUPABASE_DB_URL:-}" ] || { echo "ERROR: SUPABASE_DB_URL empty in .env" >&2; exit 1; }

EMAIL="${1:-${OPERATOR_EMAIL:-}}"
[ -n "$EMAIL" ] || { echo "ERROR: no email given and OPERATOR_EMAIL unset." >&2; exit 1; }

echo "Promoting: $EMAIL"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v email="$EMAIL" <<'SQL'
\pset pager off

-- Note: psql does NOT interpolate :variables inside a dollar-quoted DO $$ $$
-- block, so this is written as plain statements instead.

\echo '--- before ---'
select email, role, status from public.profiles where email = lower(:'email');

update public.profiles set role='operator', status='approved'
 where email = lower(:'email');

\echo '--- after ---'
select email, role, status,
       case when role='operator' and status='approved' then 'PASS — promotion persisted'
            else 'FAIL — trigger reverted it; run sql/002_updates.sql first' end as result
from public.profiles where email = lower(:'email');

\echo ''
\echo 'If the rows above are empty, that email has not registered through the'
\echo 'app yet. Register first at register.html, then re-run this script.'
SQL
