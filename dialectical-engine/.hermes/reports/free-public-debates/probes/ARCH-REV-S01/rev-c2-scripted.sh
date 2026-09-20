#!/bin/zsh
# ARCH-S01 base run for S01-C2. New files C2-S1 and C2-S3 create are omitted.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-REV-S01/rev-c2-scripted.log"
cd "$LANE"
export LOG
"$RUNNER" \
  tests/unit/s8-publication.test.ts:26:0 \
  tests/integration/s8-publication-database.test.ts:25:1
