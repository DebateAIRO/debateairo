#!/bin/zsh
# ARCH-REV-PES-S03-p1 · counts, anchors, trace. Lane is read-only.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p1/measure.mjs

echo
echo "===== 8. git pathspec capability (SPEC §5 step 7) ====="
echo "-- apps packages at HEAD (expect empty) --"
git diff --stat origin/dev...HEAD -- apps packages
echo "rc=$?"
echo "-- apps packages over origin/dev~200...origin/dev (expect non-empty) --"
git diff --stat origin/dev~200...origin/dev -- apps packages | tail -3
echo "-- dialectical-engine/apps over the same range (ARCH claims empty) --"
git diff --stat origin/dev~200...origin/dev -- dialectical-engine/apps | tail -3

echo
echo "===== 9. ^## headings ====="
/usr/bin/grep -n '^## ' deploy/vps/README.md
