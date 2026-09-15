#!/bin/bash
# post-r7-merge.sh v2 — run ONLY after a codex APPROVE (or a V merge ruling). One shot, verified at each step.
# v2 (D9 ADDENDUM): after each ff, regenerate the gitignored contract and compare its hash to integration's.
# 1) merge lane/sealedrows → integration with the staged message (no-ff, so the lane is one merge commit)
# 2) fast-forward the two pre-provisioned lanes (t17t9, h-diag) to the new integration tip
# 3) print every tip so the dispatch messages can name them exactly
set -u
V5=/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5
M=$V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
INT=$V5/.worktrees/integration
LANE_TIP=a6948439
EXPECT_TREE=c5850f732e93760cc109429a22f941c6e2d34eba   # merge-tree dry-run object for this tip

cd "$INT" || exit 2
[ "$(git status --porcelain | wc -l | tr -d ' ')" = "0" ] || { echo "REFUSING: integration dirty"; exit 3; }
[ "$(git rev-parse --short HEAD)" = "7dda3cc0" ] || { echo "REFUSING: integration tip moved from 7dda3cc0 — re-dry-run first"; exit 3; }
git merge --no-ff --no-edit -F "$M/packets/sealedrows-merge-message.txt" "$LANE_TIP" || { echo "MERGE FAILED"; exit 1; }
NEW=$(git rev-parse HEAD); TREE=$(git rev-parse HEAD^{tree})
[ "$TREE" = "$EXPECT_TREE" ] && echo "merged: $NEW · tree matches the dry-run object" || echo "merged: $NEW · WARNING tree $TREE != dry-run $EXPECT_TREE — inspect before dispatching"

for L in lane-t17t9 lane-h-diag; do
  cd "$V5/.worktrees/$L" || { echo "$L: missing"; continue; }
  [ "$(git status --porcelain | wc -l | tr -d ' ')" = "0" ] || { echo "$L: DIRTY — not fast-forwarding"; continue; }
  git merge --ff-only "$NEW" >/dev/null 2>&1 && echo "$L: ff → $(git rev-parse --short HEAD)" || { echo "$L: ff FAILED (local commits?)"; continue; }
  # D9 ADDENDUM: an ff carries source, not the gitignored generated contract. Regenerate and compare.
  if git diff --name-only "$(git rev-parse HEAD@{1})" HEAD 2>/dev/null | grep -q "pnpm-lock.yaml"; then
    (cd dialectical-engine && pnpm install --frozen-lockfile >/dev/null 2>&1) && echo "$L: lockfile changed → reinstalled" || echo "$L: REINSTALL FAILED"
  fi
  (cd dialectical-engine && pnpm run generate:contract >/dev/null 2>&1) || { echo "$L: generate:contract FAILED"; continue; }
  H_LANE=$(shasum -a 256 dialectical-engine/packages/contract/generated/field-inventory.json | cut -c1-16)
  echo "$L: contract $H_LANE"
done
# integration's own contract, regenerated on the merged tree, is the reference every lane must match
(cd "$INT/dialectical-engine" && pnpm run generate:contract >/dev/null 2>&1) || echo "integration: generate:contract FAILED"
H_INT=$(shasum -a 256 "$INT/dialectical-engine/packages/contract/generated/field-inventory.json" | cut -c1-16)
echo "integration: contract $H_INT  (every lane above must show this hash — a mismatch is a refusal)"
echo "integration=$NEW"
