#!/bin/bash
# post-merge.sh — GENERAL successor to post-r7-merge.sh. Run ONLY after a codex APPROVE or a V merge ruling.
# Usage: post-merge.sh <lane-tip> <expected-merged-tree> <integration-tip-guard> <message-file> [lane-worktree-to-ff ...]
#   <expected-merged-tree> comes from `git merge-tree --write-tree <integration> <lane-tip>` run beforehand (the dry-run).
#   <integration-tip-guard> is the tip the dry-run was taken at; refuses if integration has moved since.
# Guards: dirty tree, moved tip, merged-tree mismatch. After each ff: regenerate the gitignored contract and
# compare its hash to integration's (D9 ADDENDUM); reinstall if the lockfile changed.
set -u
LANE_TIP=${1:?lane tip}; EXPECT_TREE=${2:?expected merged tree}; GUARD=${3:?integration tip guard}; MSG=${4:?message file}; shift 4
V5=/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5
INT=$V5/.worktrees/integration
[ -f "$MSG" ] || { echo "REFUSING: message file missing: $MSG"; exit 3; }
cd "$INT" || exit 2
[ "$(git status --porcelain | wc -l | tr -d ' ')" = "0" ] || { echo "REFUSING: integration dirty"; exit 3; }
[ "$(git rev-parse --short HEAD)" = "$(git rev-parse --short "$GUARD")" ] || { echo "REFUSING: integration tip $(git rev-parse --short HEAD) != guard $GUARD — re-dry-run first"; exit 3; }
git merge --no-ff --no-edit -F "$MSG" "$LANE_TIP" || { echo "MERGE FAILED"; exit 1; }
NEW=$(git rev-parse HEAD); TREE=$(git rev-parse 'HEAD^{tree}')
if [ "$TREE" = "$EXPECT_TREE" ]; then echo "merged: $NEW · tree matches the dry-run object"; else echo "merged: $NEW · WARNING tree $TREE != dry-run $EXPECT_TREE — inspect before dispatching"; fi
(cd "$INT/dialectical-engine" && pnpm run generate:contract >/dev/null 2>&1) || echo "integration: generate:contract FAILED"
H_INT=$(shasum -a 256 "$INT/dialectical-engine/packages/contract/generated/field-inventory.json" | cut -c1-16)
echo "integration: contract $H_INT"
for L in "$@"; do
  cd "$V5/.worktrees/$L" || { echo "$L: missing"; continue; }
  [ "$(git status --porcelain | wc -l | tr -d ' ')" = "0" ] || { echo "$L: DIRTY — not fast-forwarding"; continue; }
  OLD=$(git rev-parse HEAD)
  git merge --ff-only "$NEW" >/dev/null 2>&1 || { echo "$L: ff FAILED (local commits?)"; continue; }
  if git diff --name-only "$OLD" HEAD | grep -q "pnpm-lock.yaml"; then
    (cd dialectical-engine && pnpm install --frozen-lockfile >/dev/null 2>&1) && echo "$L: lockfile changed → reinstalled" || echo "$L: REINSTALL FAILED"
  fi
  (cd dialectical-engine && pnpm run generate:contract >/dev/null 2>&1) || { echo "$L: generate:contract FAILED"; continue; }
  H=$(shasum -a 256 dialectical-engine/packages/contract/generated/field-inventory.json | cut -c1-16)
  [ "$H" = "$H_INT" ] && echo "$L: ff → $(git rev-parse --short HEAD) · contract $H matches" || echo "$L: ff → $(git rev-parse --short HEAD) · CONTRACT MISMATCH $H != $H_INT — REFUSE to dispatch here"
done
echo "integration=$NEW"
