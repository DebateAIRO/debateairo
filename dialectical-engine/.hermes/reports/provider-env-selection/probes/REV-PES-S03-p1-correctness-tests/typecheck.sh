#!/bin/zsh
# pnpm typecheck at the slice head. Delta is judged against the intake diagnostic, not rc.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-correctness-tests
CAPTURE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh
echo $$ > "$ROOT/typecheck.pid"
echo "start $(date '+%F %T %Z') pid=$$ HEAD $(git rev-parse --short HEAD)"
LOG="$ROOT/typecheck.log" zsh "$CAPTURE" pnpm typecheck
echo "DONE typecheck rc=$? $(date '+%T')"
rm -f "$ROOT/typecheck.pid"
