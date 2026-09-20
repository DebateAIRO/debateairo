#!/bin/zsh
# ARCH-S01 base run for S01-C3. New file C3-S1 creates is omitted.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-FIX-S01-02/s01-c3-base.log"
cd "$LANE"
export LOG
"$RUNNER" \
  tests/unit/s8-publication-http.test.ts:4:0 \
  tests/unit/s7-authorization.test.ts:30:1
