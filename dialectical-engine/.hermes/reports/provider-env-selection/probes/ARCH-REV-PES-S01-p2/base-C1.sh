#!/bin/zsh
# ARCH-REV-PES-S01-p2 · S01-C1 command as PLAN.md §3 writes it. C1 is built; nothing omitted.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p2/base-C1.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/pes-s01-operator-command-environment.test.ts:3:0 \
  tests/architecture:719:6 \
  tests/unit/v9-deployment-mode.test.ts:201:0 \
  tests/unit/production-environment-floors.test.ts:24:0 \
  tests/unit/dl7-f7-boot-custody.test.ts:14:0 \
  tests/unit/v20-optional-primary-provider-keys.test.ts:11:0
