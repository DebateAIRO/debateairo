#!/bin/zsh
# ARCH-S01 base run for S01-C1. New files C1-S1 and C1-S8 create are omitted.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-S01/s01-c1-base.log"
cd "$LANE"
export LOG
"$RUNNER" \
  tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 \
  tests/integration/plan-tiers-route-privileges.test.ts:1:0
