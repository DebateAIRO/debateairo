#!/bin/zsh
# ARCH-FIX-PES-S01-p2 · C4 cluster command AS IT NOW STANDS (Revision 2), run in the lane @ HEAD 5b12b2e15 (S01-C1 built).
# Created path OMITTED (S01-21): acceptance/pes-s01-publish-set-acceptance.test.ts (9:0); final architecture pair 723:6 (after C3), here 719:6.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/base-C4.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 tests/unit/text-control-bytes.test.ts:3:0
