#!/bin/zsh
# REV-PES-S03-p3-correctness-tests — every PLAN §3 cluster command + the rebased command, at the slice head.
# usage: WORKTREE=<lane dialectical-engine dir> zsh cluster-commands.sh   (or pass it as $1)
set -u
export PATH="/opt/homebrew/bin:$PATH"
W="${1:-${WORKTREE:?set WORKTREE or pass the lane's dialectical-engine dir}}"
HERE="${0:A:h}"; RS=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
cd "$W" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
LOG=$HERE/c1.log zsh $RS tests/unit/v9-provider-credential-files.test.ts:24:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
LOG=$HERE/c2.log zsh $RS tests/unit/v9-provider-credential-files.test.ts:28:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
LOG=$HERE/c3.log zsh $RS tests/unit/v9-provider-credential-files.test.ts:31:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
for i in 1 2 3; do
  echo "--- rebased run $i"
  LOG=$HERE/rebased-run$i.log zsh $RS tests/unit/v9-provider-credential-files.test.ts:31:0 tests/architecture/vps-deployment-baseline.test.ts:43:0 tests/unit/v30-support-provider.test.ts:30:0
done
echo "END dirty $(git status --porcelain | wc -l | tr -d ' ')"
