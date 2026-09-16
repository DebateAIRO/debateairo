#!/bin/zsh
# REV-S03-p2-correctness-tests — run the promoted probes in ANY worktree.
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S03-p2-correctness-tests-run-probe.sh
#   …or:  zsh REV-S03-p2-correctness-tests-run-probe.sh /abs/path/to/<wt>/dialectical-engine
# The root comes from $WORKTREE, else argv[1], else the cwd — NEVER hard-coded.
# Copies the probe files into <root>/tests/unit/, runs them, removes them, and prints the
# porcelain after, so the tree it borrowed ends exactly as it was found.
#
# Written against head d35a9634. Both probe files read every model id from the committed
# config/models.yaml through loadModelConfig, so they travel to any head without editing;
# what can change between heads is the RESULT, not the probe.
set -u
# A nested zsh script can start with a minimal PATH (measured: `rm`, `wc` and `tr` not found,
# which silently skipped this script's own cleanup on its first run). Pin the base tools.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
WT="${WORKTREE:-${1:-$PWD}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || { echo "NO SUCH WORKTREE: $WT"; exit 9; }

PROBES=(
  REV-S03-p2-correctness-tests-probe.test.ts
  REV-S03-p2-correctness-tests-f2-crosscheck.test.ts
)

echo "worktree:  $WT"
echo "HEAD:      $(git rev-parse --short HEAD 2>/dev/null || echo '(not a git tree)')"
echo "porcelain before: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"

copied=()
for probe in $PROBES; do
  if [ -e "$WT/tests/unit/$probe" ]; then
    echo "REFUSING: $WT/tests/unit/$probe already exists"; exit 8
  fi
  cp "$HERE/$probe" "$WT/tests/unit/$probe" || exit 9
  copied+=("tests/unit/$probe")
done

env LANG=en_US.UTF-8 npx vitest run $copied
rc=$?

# NEVER name this loop variable `path`: in zsh `path` is tied to `PATH`, so the first
# iteration blanks PATH and every later `rm`/`wc`/`tr` becomes "command not found" —
# measured, and it silently skipped this script's own cleanup.
for relpath in $copied; do rm -f "$WT/$relpath"; done

echo "rc=$rc"
echo "porcelain after:  $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') entries"
exit $rc
