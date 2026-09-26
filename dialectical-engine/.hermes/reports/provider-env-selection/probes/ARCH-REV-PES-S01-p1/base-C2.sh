#!/bin/zsh
# ARCH-REV-PES-S01-p1 · re-run S01-C2 at base. Created path omitted (S01-06 creates it):
#   tests/unit/pes-s01-hosted-provider-set.test.ts
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p1/base-C2.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/unit/v9-configured-provider-set-deployment.test.ts:14:0 \
  tests/unit/text-control-bytes.test.ts:3:0
