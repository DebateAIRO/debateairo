#!/bin/zsh
# REV-S03-p3-correctness-tests — run the pass-3 probe in ANY worktree.
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S03-p3-correctness-tests-run-probe.sh
#   …or:  zsh REV-S03-p3-correctness-tests-run-probe.sh /abs/path/to/<wt>/dialectical-engine
# The root comes from $WORKTREE, else argv[1], else the cwd — NEVER hard-coded.
# Copies the probe into <root>/tests/unit/, runs it, removes it, prints the porcelain after.
#
# Written against head 3f488b3f (integration/all, after slice/tiers-s03 @ 0fe14637 = FIX-S03-p2-F1).
# The probe reads every model id from the committed config/models.yaml through PLAN_TIER_ROSTERS
# or builds the row with the production publisher, so it travels to any head without editing.
# WHAT CAN CHANGE BETWEEN HEADS IS THE RESULT, NOT THE PROBE: case Y1 pins the set of shapes on
# which the strict wire schema and the application seam DISAGREE. At 3f488b3f that set has exactly
# two members. If the reader-side projection is ever replaced, re-derive Y1 before trusting it.
set -u
# A nested zsh script can start with a minimal PATH. Pin the base tools.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
WT="${WORKTREE:-${1:-$PWD}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || { echo "NO SUCH WORKTREE: $WT"; exit 9; }

PROBE=REV-S03-p3-correctness-tests-probe.test.ts

echo "worktree:  $WT"
echo "HEAD:      $(git rev-parse --short HEAD 2>/dev/null || echo '(not a git tree)')"
echo "porcelain before: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"

if [ -e "$WT/tests/unit/$PROBE" ]; then
  echo "REFUSING: $WT/tests/unit/$PROBE already exists"; exit 8
fi
cp "$HERE/$PROBE" "$WT/tests/unit/$PROBE" || exit 9

env LANG=en_US.UTF-8 npx vitest run "tests/unit/$PROBE"
rc=$?

# NEVER name a loop variable `path` in zsh: it is tied to PATH.
rm -f "$WT/tests/unit/$PROBE"

echo "rc=$rc"
echo "porcelain after:  $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"
exit $rc
