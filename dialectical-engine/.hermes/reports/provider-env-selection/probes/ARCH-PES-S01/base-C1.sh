#!/bin/zsh
# ARCH-PES-S01 · S01-C1 cluster command at BASE (776359c3). Created path OMITTED (it does not exist until step S01-01):
#   tests/unit/pes-s01-operator-command-environment.test.ts
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-C1.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/unit/v9-deployment-mode.test.ts:201:0 \
  tests/unit/production-environment-floors.test.ts:24:0 \
  tests/unit/dl7-f7-boot-custody.test.ts:14:0 \
  tests/unit/v20-optional-primary-provider-keys.test.ts:11:0
