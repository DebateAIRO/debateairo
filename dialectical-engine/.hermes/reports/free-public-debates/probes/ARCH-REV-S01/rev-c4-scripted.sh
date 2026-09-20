#!/bin/zsh
# ARCH-S01 base run for S01-C4. New files C4-S1 and C4-S2 create are omitted.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-REV-S01/rev-c4-scripted.log"
cd "$LANE"
export LOG
"$RUNNER" \
  tests/unit/s10-erasure-http.test.ts:8:0
