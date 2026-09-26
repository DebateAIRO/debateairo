#!/bin/zsh
# ARCH-FIX-PES-S01-p2 · C1 cluster command AS IT NOW STANDS (Revision 2), run in the lane @ HEAD 5b12b2e15 (S01-C1 built).
# Full command, nothing omitted: C1 is built (its suite exists at 5b12b2e15).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/base-C1.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/pes-s01-operator-command-environment.test.ts:3:0 tests/architecture:719:6 tests/unit/v9-deployment-mode.test.ts:201:0 tests/unit/production-environment-floors.test.ts:24:0 tests/unit/dl7-f7-boot-custody.test.ts:14:0 tests/unit/v20-optional-primary-provider-keys.test.ts:11:0
