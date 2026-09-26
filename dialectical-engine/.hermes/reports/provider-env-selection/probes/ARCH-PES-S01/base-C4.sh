#!/bin/zsh
# ARCH-PES-S01 · S01-C4 cluster command at BASE (776359c3). Created path OMITTED (it does not exist until step S01-21):
#   acceptance/pes-s01-publish-set-acceptance.test.ts
# The FINAL command carries tests/architecture:723:6 (base 719:6 plus the 4 cases step S01-17 creates); at base the pair is 719:6.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-C4.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/unit/text-control-bytes.test.ts:3:0
