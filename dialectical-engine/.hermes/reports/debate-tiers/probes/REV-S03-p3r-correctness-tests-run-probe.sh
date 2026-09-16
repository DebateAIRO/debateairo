#!/bin/zsh
# REV-S03-p3r-correctness-tests — run the V-47 re-check probe in ANY worktree.
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S03-p3r-correctness-tests-run-probe.sh
#   …or:  zsh REV-S03-p3r-correctness-tests-run-probe.sh /abs/path/to/<wt>/dialectical-engine
# The root comes from $WORKTREE, else argv[1], else the cwd — NEVER hard-coded.
# Copies the probe into <root>/tests/integration/, runs it, removes it, prints the porcelain after.
#
# Written against head b97985a8 (integration/all, after slice/tiers-s03 @ a25c0d99 = FIX-S03-p3-F1
# + RULING 4). It starts its own embedded postgres on a reserved random port; it never touches the
# :55432 dev database, the running stack, or any .local/ tree — the receipt lives in a mkdtemp root.
#
# The oracle is INLINE and is V's own database: the 32 rows of sealed register version 4 with their
# canonical value digests, measured read-only by the orchestrator on 2026-09-16
# (.hermes/reports/debate-tiers/review-packages/S03-p3r/live/serve-merged-diag-v4-rows-a49d9734.log).
# Case A fails the moment the historical builder stops reproducing that sealed set byte for byte;
# that is the whole point — 120bdfea… is v4, 42b90bca… is version NINE's five-slot set.
# WHAT CAN CHANGE BETWEEN HEADS IS THE RESULT, NOT THE PROBE.
set -u
# A nested zsh script can start with a minimal PATH. Pin the base tools.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
WT="${WORKTREE:-${1:-$PWD}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || { echo "NO SUCH WORKTREE: $WT"; exit 9; }

PROBE=REV-S03-p3r-correctness-tests-probe.test.ts

echo "worktree:  $WT"
echo "HEAD:      $(git rev-parse --short HEAD 2>/dev/null || echo '(not a git tree)')"
echo "porcelain before: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"

if [ -e "$WT/tests/integration/$PROBE" ]; then
  echo "REFUSING: $WT/tests/integration/$PROBE already exists"; exit 8
fi
cp "$HERE/$PROBE" "$WT/tests/integration/$PROBE" || exit 9

env LANG=en_US.UTF-8 npx vitest run "tests/integration/$PROBE"
rc=$?

# NEVER name a loop variable `path` in zsh: it is tied to PATH.
rm -f "$WT/tests/integration/$PROBE"

echo "rc=$rc"
echo "porcelain after:  $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"
exit $rc
