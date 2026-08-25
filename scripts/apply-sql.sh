#!/usr/bin/env bash
# Apply the Jericho Platform SQL scripts to the live Supabase database, in order.
#
#   ./scripts/apply-sql.sh            # apply everything
#   ./scripts/apply-sql.sh 002_updates.sql seed_commodities.sql   # or a subset
#
# Reads SUPABASE_DB_URL from .env. Requires psql (comes with postgresql-client).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: no .env file. Run:  cp .env.example .env  and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: SUPABASE_DB_URL is empty in .env." >&2
  echo "Get it from the Supabase Dashboard -> Connect -> connection string." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install it:" >&2
  echo "  macOS:  brew install libpq && brew link --force libpq" >&2
  echo "  Ubuntu: sudo apt install postgresql-client" >&2
  exit 1
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=(schema.sql rls_policies.sql 002_updates.sql seed_commodities.sql)
fi

echo "Target: ${SUPABASE_DB_URL%%:*}://...@${SUPABASE_DB_URL##*@}"
echo

for f in "${FILES[@]}"; do
  path="sql/$f"
  [ -f "$path" ] || { echo "ERROR: $path not found" >&2; exit 1; }
  echo "=== applying $f ==="
  # ON_ERROR_STOP so a failure halts instead of silently continuing.
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$path"; then
    echo "    OK"
  else
    echo "    FAILED on $f — stopping." >&2
    exit 1
  fi
  echo
done

echo "All scripts applied."
