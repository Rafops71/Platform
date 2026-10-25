#!/usr/bin/env bash
#
# Assemble exactly the files the live site serves, into dist/, and refuse to
# finish if any of them is missing.
#
# WHY THIS EXISTS
#
# Until 2026-10-25 GitHub Pages published the whole repository straight from
# main, on its own, whatever CI said: on commit 556e185 the site went live at
# 14:42:43 and the checklist finished at 14:55:03. The "gate" decided whether
# an artifact existed, not what members got. ci.yml now publishes the site
# itself, only after every check passes, and this script decides what that
# publication contains.
#
# The old packaging step copied css/, js/ and the pages - and NOT films/,
# which register.html loads at runtime (js/auth.js builds the path
# `films/member-${lang}.mp4`). Deployed as it was, it would have removed the
# registration film from the live site, and nothing would have failed: no test
# loads the deployed copy. So the check at the end is the point of the file,
# not decoration.
#
# WHAT IS DELIBERATELY NOT PUBLISHED ANY MORE
#
# Branch publishing ran the repository through Jekyll, which turned every
# Markdown file into a public web page: /HANDOFF and /docs/CHECKLIST answered
# 200 on the live site, internal notes included. Those stay readable in the
# repository; they are no longer served as part of the platform.

set -euo pipefail

OUT="${1:-dist}"
rm -rf "$OUT"
mkdir -p "$OUT"

cp -r css js films "$OUT/"
cp ./*.html "$OUT/"
echo "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}" > "$OUT/REVISION"

# ---------------------------------------------------------------- the check --
missing=0
check() { [ -e "$OUT/$1" ] || { echo "MISSING from the site: $1"; missing=1; }; }

# Every local file a page points at with src= or href=.
#
# Collected into a variable first, NOT piped into `while read`: a loop on the
# right of a pipe runs in a subshell, so `missing=1` set inside it is thrown
# away when the loop ends and the script would report success over a missing
# file. The first version of this script had exactly that bug; it was caught
# by making the check fail on purpose before trusting it.
refs="$(grep -ohE '(src|href|poster)="[^"#?]+' "$OUT"/*.html \
  | sed -E 's/^(src|href|poster)="//' \
  | grep -vE '^(https?:|mailto:|tel:|//|data:)' \
  | sed -E 's#^\./##' | sort -u)"
for ref in $refs; do check "$ref"; done

# The films the registration page builds a path to at runtime, which no
# src= attribute names, so the loop above cannot see them.
for lang in en es; do check "films/member-$lang.mp4"; done

# The pages themselves.
for p in index.html register.html app.html operator.html reset.html terms.html; do
  check "$p"
done

if [ "$missing" -ne 0 ]; then
  echo "The site is incomplete. Refusing to publish it."
  exit 1
fi

echo "Site assembled in $OUT/: $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1), revision $(cat "$OUT/REVISION")."
