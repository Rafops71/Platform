#!/usr/bin/env bash
#
# The git side of the nightly database backup (.github/workflows/database-backup.yml): push the encrypted dump to the
# PRIVATE repository that holds the backups, read it back to prove it arrived intact, and remove dated files older than
# the retention. This repository is PUBLIC, so nothing secret is in this file: the token and the passphrase arrive in the
# environment, are never printed, and the token is passed to git through environment variables only (never in a URL,
# never on a command line, never written to a git config).
#
#   scripts/backup-repo.sh push <encrypted-file>      stores it as db-YYYY-MM-DD.dump.enc (UTC date) on main
#   scripts/backup-repo.sh verify <encrypted-file>    fresh clone: the stored copy must have the same sha256
#   scripts/backup-repo.sh retention <days>           delete db-YYYY-MM-DD.dump.enc files older than <days>
#   scripts/backup-repo.sh teardown-test              push a harmless dummy file, read it back, delete it, read back
#                                                     that it is gone. Proves the delete path, touches no backup.
#
# Environment:  BACKUP_REPO_TOKEN (required against GitHub)   BACKUP_REPO (default Rafops71/platform-backups)
#               BACKUP_REPO_URL (tests only: point it at a local bare repository; no token is used then)
#
# WHAT IT NEVER TOUCHES: any file whose name is not exactly db-YYYY-MM-DD.dump.enc (the README, the dummy file of
# teardown-test), and any other repository.
#
# TO DELETE ONE PUSHED BACKUP BY HAND (the owner, with his own GitHub login): open the private repository, open the file,
# trash-can icon, commit. Or: git clone it, git rm db-YYYY-MM-DD.dump.enc, git commit, git push. Note that git keeps old
# versions in its history: deleting a file stops it appearing in the repository, it does not erase the history of it.

set -euo pipefail
export GIT_TERMINAL_PROMPT=0

REPO="${BACKUP_REPO:-Rafops71/platform-backups}"
URL="${BACKUP_REPO_URL:-https://github.com/${REPO}.git}"
TOKEN="${BACKUP_REPO_TOKEN:-}"
MAX_BYTES=$((90 * 1024 * 1024))   # GitHub refuses a pushed file over 100 MB; stop well before it
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "$TOKEN" ] && [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$TOKEN"; fi

# git with the token as an Authorization header supplied through the environment (not a URL, not an argument, not saved).
git_run() {
  if [ -n "$TOKEN" ] && [[ "$URL" == https://* ]]; then
    local auth
    auth="$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$auth"; fi
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraheader GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $auth" git "$@"
  else
    git "$@"
  fi
}

fail() { echo "::error::$*" >&2; exit 1; }

clone_into() {   # clone_into <dir>
  git_run clone --quiet --depth 1 "$URL" "$1" 2>&1 | sed 's/^/  git: /' || true
  [ -d "$1/.git" ] || fail "Could not clone the backup repository."
  git -C "$1" config user.name "database-backup"
  git -C "$1" config user.email "database-backup@users.noreply.github.com"
  local branch
  branch="$(git -C "$1" symbolic-ref --short HEAD)"
  [ "$branch" = "main" ] || fail "The backup repository's branch is '$branch', expected 'main'."
}

push_dir() {     # push_dir <dir>; one retry if the remote moved
  if ! git_run -C "$1" push --quiet origin HEAD 2>/dev/null; then
    git_run -C "$1" pull --quiet --rebase origin main
    git_run -C "$1" push --quiet origin HEAD || fail "Push to the backup repository failed."
  fi
}

sha() { sha256sum "$1" | cut -d' ' -f1; }
today() { date -u +%F; }

cmd="${1:-}"
case "$cmd" in
  push)
    FILE="${2:-}"; [ -f "$FILE" ] || fail "push: no such file '$FILE'."
    BYTES="$(stat -c%s "$FILE")"
    [ "$BYTES" -le "$MAX_BYTES" ] || fail "The encrypted backup is $BYTES bytes: too big for a git push (limit 100 MB, stopping at 90). Tell the supervisor; do not retry."
    NAME="db-$(today).dump.enc"
    clone_into "$WORK/repo"
    cp -f "$FILE" "$WORK/repo/$NAME"
    git -C "$WORK/repo" add "$NAME"
    if git -C "$WORK/repo" diff --cached --quiet; then
      echo "Nothing to commit: $NAME is already stored with these exact bytes."
    else
      git -C "$WORK/repo" commit --quiet -m "Database backup $(today)"
      push_dir "$WORK/repo"
    fi
    echo "Stored $NAME ($BYTES bytes, sha256 $(sha "$FILE"))."
    ;;

  verify)
    FILE="${2:-}"; [ -f "$FILE" ] || fail "verify: no such file '$FILE'."
    NAME="db-$(today).dump.enc"
    clone_into "$WORK/check"
    [ -f "$WORK/check/$NAME" ] || fail "After the push, $NAME is not in a fresh clone of the backup repository."
    LOCAL="$(sha "$FILE")"; REMOTE="$(sha "$WORK/check/$NAME")"
    echo "local  sha256 $LOCAL"
    echo "stored sha256 $REMOTE"
    [ "$LOCAL" = "$REMOTE" ] || fail "The stored copy differs from the local one. The backup is NOT safely stored."
    echo "Read back from a fresh clone: the stored file is byte-for-byte the one this run made."
    ;;

  retention)
    DAYS="${2:-}"; [[ "$DAYS" =~ ^[0-9]+$ ]] && [ "$DAYS" -ge 1 ] || fail "retention: give a number of days."
    CUTOFF="$(date -u -d "$DAYS days ago" +%F)"
    clone_into "$WORK/repo"
    DELETED=()
    shopt -s nullglob
    for f in "$WORK"/repo/db-*.dump.enc; do
      base="$(basename "$f")"
      if [[ "$base" =~ ^db-([0-9]{4}-[0-9]{2}-[0-9]{2})\.dump\.enc$ ]]; then
        d="${BASH_REMATCH[1]}"
        # ISO dates compare correctly as text; a date that does not parse is left alone.
        if date -u -d "$d" +%F >/dev/null 2>&1 && [[ "$d" < "$CUTOFF" ]]; then
          git -C "$WORK/repo" rm --quiet "$base"
          DELETED+=("$base")
        fi
      fi
    done
    if [ "${#DELETED[@]}" -eq 0 ]; then
      echo "Retention: nothing older than $DAYS days (cutoff $CUTOFF)."
    else
      git -C "$WORK/repo" commit --quiet -m "Retention: delete ${#DELETED[@]} backup(s) older than $DAYS days"
      push_dir "$WORK/repo"
      echo "Retention: deleted ${#DELETED[@]} backup(s) older than $DAYS days (cutoff $CUTOFF):"
      printf '  %s\n' "${DELETED[@]}"
      clone_into "$WORK/after"
      for b in "${DELETED[@]}"; do [ ! -e "$WORK/after/$b" ] || fail "$b is still in the repository after the delete."; done
      echo "Read back from a fresh clone: they are gone."
    fi
    ;;

  teardown-test)
    NAME="teardown-test-$(date -u +%Y%m%dT%H%M%SZ).txt"
    clone_into "$WORK/repo"
    echo "Harmless dummy file made by scripts/backup-repo.sh teardown-test. Safe to delete." > "$WORK/repo/$NAME"
    WANT="$(sha "$WORK/repo/$NAME")"
    git -C "$WORK/repo" add "$NAME"; git -C "$WORK/repo" commit --quiet -m "Teardown test: add $NAME"; push_dir "$WORK/repo"
    clone_into "$WORK/seen"
    [ -f "$WORK/seen/$NAME" ] && [ "$(sha "$WORK/seen/$NAME")" = "$WANT" ] || fail "The dummy file did not arrive intact."
    echo "1. pushed and read back: $NAME"
    git -C "$WORK/repo" rm --quiet "$NAME"; git -C "$WORK/repo" commit --quiet -m "Teardown test: delete $NAME"; push_dir "$WORK/repo"
    clone_into "$WORK/gone"
    [ ! -e "$WORK/gone/$NAME" ] || fail "The dummy file is still there after the delete."
    echo "2. deleted and read back from a fresh clone: it is gone."
    echo "The delete path works. No backup file was touched."
    ;;

  *)
    echo "usage: $0 push <file> | verify <file> | retention <days> | teardown-test" >&2
    exit 64
    ;;
esac
