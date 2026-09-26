#!/bin/zsh
# ARCH-REV-PES-S01-p1 · re-run S01-C4 at base. Created path omitted (S01-21 creates it):
#   acceptance/pes-s01-publish-set-acceptance.test.ts
# Final command expects tests/architecture:723:6; at base the directory pair is 719:6.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p1/base-C4.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/unit/text-control-bytes.test.ts:3:0
