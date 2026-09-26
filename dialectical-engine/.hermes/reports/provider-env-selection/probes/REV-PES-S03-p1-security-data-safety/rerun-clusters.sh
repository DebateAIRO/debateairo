#!/bin/zsh
# REV-PES-S03-p1-security-data-safety — re-run PLAN §3 cluster commands at HEAD 98264a5ea.
# cwd must be the detached review worktree. Does not install, listen, or write the worktree.
set -u
export PATH="/opt/homebrew/bin:$PATH"
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
OUT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-security-data-safety"
cd "$ROOT" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
typeset -a names=(C1 C2 C3)
typeset -a pairs=(
  "tests/unit/v9-provider-credential-files.test.ts:24:0 tests/architecture/vps-deployment-baseline.test.ts:31:0"
  "tests/unit/v9-provider-credential-files.test.ts:28:0 tests/architecture/vps-deployment-baseline.test.ts:31:0"
  "tests/unit/v9-provider-credential-files.test.ts:31:0 tests/architecture/vps-deployment-baseline.test.ts:31:0"
)
for i in 1 2 3; do
  name=${names[$i]}
  log="$OUT/${name}-rerun.log"
  echo "=== $name $(date '+%Y-%m-%dT%H:%M:%S%z') ==="
  LOG="$log" zsh "$RUNNER" ${=pairs[$i]}
  echo "=== $name rc=$? ==="
done
echo "DIRTY_AFTER $(git status --porcelain | wc -l | tr -d ' ')"
