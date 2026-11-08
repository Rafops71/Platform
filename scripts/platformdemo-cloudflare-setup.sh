#!/usr/bin/env bash
#
# Proves the teardown for the platformdemo Cloudflare Pages project, then creates it.
# Run only by .github/workflows/platformdemo-cloudflare-setup.yml (workflow_dispatch).
#
# ORDER, and why:
#   1. Create a throwaway project, deletetest-platformdemo.
#   2. Confirm it is listed.
#   3. Delete it with the command HANDOFF.md gives as the teardown.
#   4. Confirm it is gone. If it is still listed, stop.
#   5. Only then create platformdemo (skipped if it already exists).
#
# THE NAMES ARE HARD-CODED. This script never touches `platform`, `platform-www`
# the member demo's `myplatform-demo` or the Operator demo's `myplatform-operator-demo`;
# it refuses to run if any of them appears.
# Wrangler is pinned to the version reviewed on 2026-11-03.

set -euo pipefail

TEST_PROJECT="deletetest-tradedemo"
DEMO_PROJECT="tradedemo"
WRANGLER="npx --yes wrangler@4.157.0"

# Refuse to run with any other name. The live projects are never valid here.
for name in "$TEST_PROJECT" "$DEMO_PROJECT"; do
  case "$name" in
    platform|platform-www|myplatform-demo|myplatform-operator-demo) echo "REFUSED: $name is a live project, not this one."; exit 1 ;;
  esac
done
[ "$TEST_PROJECT" = "deletetest-tradedemo" ] || { echo "REFUSED: test project name changed."; exit 1; }
[ "$DEMO_PROJECT" = "tradedemo" ] || { echo "REFUSED: platformdemo project name changed."; exit 1; }

# Is the project listed? Whole-word match on the name in wrangler's list output.
# The output is captured first: with `pipefail`, `grep -q` exiting early would
# make the pipe look like a failure, and a listed project would read as missing.
listed() {
  local out
  out="$($WRANGLER pages project list 2>&1)"
  printf '%s\n' "$out" | grep -qw -- "$1"
}

echo "== 1. Projects before anything is created"
$WRANGLER pages project list

if listed "$TEST_PROJECT"; then
  echo "STOP: $TEST_PROJECT already exists. Left from an earlier run; not deleted by this script."
  exit 1
fi

echo "== 2. Create $TEST_PROJECT"
$WRANGLER pages project create "$TEST_PROJECT" --production-branch=main

echo "== 3. Is $TEST_PROJECT listed?"
listed "$TEST_PROJECT" || { echo "FAIL: $TEST_PROJECT was not listed after create."; exit 1; }
echo "PROOF: $TEST_PROJECT listed after create."

echo "== 4. Delete $TEST_PROJECT (HANDOFF.md teardown)"
$WRANGLER pages project delete "$TEST_PROJECT" --yes

echo "== 5. Is $TEST_PROJECT gone?"
if listed "$TEST_PROJECT"; then
  echo "FAIL: $TEST_PROJECT is still listed after delete. Not creating $DEMO_PROJECT."
  exit 1
fi
echo "PROOF: $TEST_PROJECT gone after delete."

echo "== 6. Create $DEMO_PROJECT"
if listed "$DEMO_PROJECT"; then
  echo "SKIP: $DEMO_PROJECT already exists."
else
  $WRANGLER pages project create "$DEMO_PROJECT" --production-branch=main
fi

echo "== 7. Is $DEMO_PROJECT listed?"
listed "$DEMO_PROJECT" || { echo "FAIL: $DEMO_PROJECT is not listed."; exit 1; }
echo "DONE: $DEMO_PROJECT listed. Projects now:"
$WRANGLER pages project list
