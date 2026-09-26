#!/bin/zsh
# ARCH-FIX-PES-S01-p2 · C2 cluster command AS IT NOW STANDS (Revision 2), run in the lane @ HEAD 5b12b2e15 (S01-C1 built).
# Created path OMITTED (S01-06 creates it): tests/unit/pes-s01-hosted-provider-set.test.ts (final pair 37:0).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/base-C2.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 tests/unit/v9-configured-provider-set-deployment.test.ts:14:0 tests/unit/text-control-bytes.test.ts:3:0
