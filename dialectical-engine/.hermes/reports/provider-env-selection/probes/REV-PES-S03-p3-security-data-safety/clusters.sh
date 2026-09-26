#!/bin/zsh
# REV-PES-S03-p3-security-data-safety — re-run every PLAN §3 cluster command + the rebased command + typecheck.
# usage: zsh clusters.sh [WORKTREE]   (default $WORKTREE, else the lens worktree)
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:-${WORKTREE:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine}}"
HERE="${0:A:h}"; OUT="$HERE/logs"; mkdir -p "$OUT"
RS=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
TS=$(date +%Y%m%d-%H%M%S)
cd "$WT" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ') node $(node --version)"
V9=tests/unit/v9-provider-credential-files.test.ts; BL=tests/architecture/vps-deployment-baseline.test.ts; V30=tests/unit/v30-support-provider.test.ts
for run in 1 2 3; do
  echo "--- run $run"
  echo "[C1]"; LOG="$OUT/C1-$TS-r$run.log" zsh $RS $V9:24:0 $BL:31:0
  echo "[C2]"; LOG="$OUT/C2-$TS-r$run.log" zsh $RS $V9:28:0 $BL:31:0
  echo "[C3]"; LOG="$OUT/C3-$TS-r$run.log" zsh $RS $V9:31:0 $BL:31:0
  echo "[REBASED]"; LOG="$OUT/rebased-$TS-r$run.log" zsh $RS $V9:31:0 $BL:43:0 $V30:30:0
done
echo "[typecheck]"; pnpm typecheck > "$OUT/typecheck-$TS.log" 2>&1; echo "typecheck rc=$? diagnostics=$(/usr/bin/grep -cE 'error TS[0-9]+' "$OUT/typecheck-$TS.log")"
echo "dirty-after $(git status --porcelain | wc -l | tr -d ' ')"
