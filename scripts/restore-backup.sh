#!/usr/bin/env bash
#
# Restore a backup taken by .github/workflows/backup.yml.
#
# READ THIS BEFORE RUNNING ANYTHING
#
# This script does NOT write to the live database and has no option to. It
# restores into a database you name, and it refuses to start if that database
# already has tables in it. Pointing a restore at a live platform is how a bad
# day becomes an unrecoverable one, so the decision to overwrite anything real
# is deliberately not available here: do that by hand, awake, having first
# restored to a copy and looked at it.
#
#   ./scripts/restore-backup.sh backup.dump.enc "postgresql://.../restore_check"
#
# WHAT YOU NEED
#
#   1. The encrypted file, from the GitHub Actions run that made it:
#      Actions > Database backup > the run > Artifacts > database-backup-NN
#   2. BACKUP_PASSPHRASE. It is not in this repository and cannot be recovered
#      from it. Without it the file is not slow to read, it is unreadable.
#   3. pg_restore and psql version 17 or newer. The runner's own 16 will not
#      read these dumps (pg_restore refuses a dump from a newer server), which
#      is why the workflow installs 17 from PGDG.
#
# WHAT IT DOES, IN ORDER
#
#   decrypt -> check the header really is a dump -> refuse a non-empty target
#   -> create the roles a Supabase dump references -> restore -> run
#   scripts/verify-restore.sql and report what came back.
#
# The verification at the end is the same one every backup already passes in
# CI. Running it again here is not belt-and-braces: a backup that restored on
# a runner three weeks ago and will not restore on your machine today is
# exactly the thing you want to find out before you need it.

set -euo pipefail

ENC="${1:-}"
TARGET="${2:-}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/17/bin}"

if [ -z "$ENC" ] || [ -z "$TARGET" ]; then
  echo "usage: $0 <backup.dump.enc> <target-postgres-url>" >&2
  echo "" >&2
  echo "The target must be an EMPTY database. This script will not overwrite" >&2
  echo "a populated one, and will not touch the live platform." >&2
  exit 64
fi

for tool in "$PG_BIN/pg_restore" "$PG_BIN/psql" openssl; do
  command -v "$tool" >/dev/null 2>&1 || [ -x "$tool" ] || {
    echo "Missing: $tool" >&2
    echo "Set PG_BIN to your PostgreSQL 17+ bin directory if it is elsewhere." >&2
    exit 69
  }
done

[ -f "$ENC" ] || { echo "No such file: $ENC" >&2; exit 66; }

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE is not set in the environment." >&2
  echo "Run:  BACKUP_PASSPHRASE='...' $0 $ENC '<url>'" >&2
  echo "Passing it this way rather than as an argument keeps it out of your" >&2
  echo "shell history and out of the process list." >&2
  exit 78
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "1/5  Decrypting."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:BACKUP_PASSPHRASE -in "$ENC" -out "$WORK/restored.dump" 2>/dev/null || {
  echo "" >&2
  echo "Decryption failed. Almost always the wrong passphrase." >&2
  echo "There is no way to recover the contents without the right one." >&2
  exit 1
}

head -c 5 "$WORK/restored.dump" | grep -q PGDMP || {
  echo "Decrypted, but the result is not a PostgreSQL custom-format dump." >&2
  echo "Either the file is not one of these backups, or it is damaged." >&2
  exit 1
}
echo "     Decrypted: $(stat -c%s "$WORK/restored.dump") bytes, header looks like a dump."

echo "2/5  Checking the target is empty."
EXISTING="$("$PG_BIN/psql" "$TARGET" -tAc \
  "select count(*) from information_schema.tables where table_schema in ('public','auth')")"
if [ "$EXISTING" != "0" ]; then
  echo "" >&2
  echo "Refusing to continue: the target already holds $EXISTING table(s) in" >&2
  echo "public/auth. Restore into an empty database and compare, rather than" >&2
  echo "writing over something that exists." >&2
  exit 1
fi
echo "     Target is empty."

echo "3/5  Creating the roles a Supabase dump refers to."
for r in anon authenticated service_role supabase_admin authenticator; do
  "$PG_BIN/psql" "$TARGET" -q -c \
    "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;"
done

echo "4/5  Restoring."
# Not --exit-on-error: a Supabase dump names extensions and roles a plain
# PostgreSQL does not have, and those errors are expected. Step 5 is what
# decides whether this worked.
"$PG_BIN/pg_restore" --no-owner --no-privileges --dbname="$TARGET" \
  "$WORK/restored.dump" 2>"$WORK/restore.log" || true
echo "     pg_restore finished. Last lines of its output:"
tail -5 "$WORK/restore.log" | sed 's/^/       /' || true

echo "5/5  Checking what actually came back."
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if "$PG_BIN/psql" "$TARGET" -v ON_ERROR_STOP=1 -f "$HERE/verify-restore.sql"; then
  echo ""
  echo "The backup restored and holds the platform."
else
  echo "" >&2
  echo "The restore did not produce a usable platform. Read the message above:" >&2
  echo "it names what was missing or empty." >&2
  exit 1
fi
