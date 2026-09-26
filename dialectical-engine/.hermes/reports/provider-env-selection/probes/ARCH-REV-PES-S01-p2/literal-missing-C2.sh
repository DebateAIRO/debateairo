#!/bin/zsh
# ARCH-REV-PES-S01-p2 · the C2 pair the plan's command column names, before S01-06 creates the file.
# Expect BROKEN. The plan creates this path (S01-06), so BROKEN at base is not a defect.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p2/literal-missing-C2.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/pes-s01-hosted-provider-set.test.ts:37:0
