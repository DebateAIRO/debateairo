#!/bin/zsh
# ARCH-REV-PES-S03-p1 · re-run of the base pair PLAN §3 records as CLUSTER_GREEN.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG="${LOG:?set LOG}" \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:23:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
