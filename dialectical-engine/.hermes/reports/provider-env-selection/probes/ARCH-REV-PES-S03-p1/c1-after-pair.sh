#!/bin/zsh
# ARCH-REV-PES-S03-p1 · re-run of the S03-C1 cluster command at base.
# PLAN §3 records CLUSTER_RED: v9 23/0 where the command expects 24/0, baseline 31/0.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG="${LOG:?set LOG}" \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:24:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
