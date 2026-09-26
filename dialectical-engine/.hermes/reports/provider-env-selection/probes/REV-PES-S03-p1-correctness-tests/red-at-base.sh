#!/bin/zsh
# The four suites RED at intake, re-run at their intake pairs (00-intake.md §5b, PLAN §4).
# Embedded postgres for t16 uses listen(0); this script does not bind a NO-TOUCH port
# and does not open 127.0.0.1:55432.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-correctness-tests
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
echo $$ > "$ROOT/red-at-base.pid"
echo "start $(date '+%F %T %Z') pid=$$ HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
LOG="$ROOT/red-at-base.log" zsh "$RUNNER" \
  tests/integration/dev-api-environment.test.ts:9:1 \
  tests/integration/dev-api-process.test.ts:5:5 \
  tests/integration/dev-provider-panel.test.ts:3:1 \
  tests/integration/t16-algorithm-register.test.ts:20:1
echo "DONE red-at-base rc=$? $(date '+%T')"
rm -f "$ROOT/red-at-base.pid"
