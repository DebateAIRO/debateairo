#!/bin/zsh
# ARCH-PES-S03 · the S03-C1 CLUSTER COMMAND (its AFTER pair) run at base.
# Expected at base: CLUSTER_RED — v9 reads 23/0 where the cluster expects 24/0 (the one case C1 adds).
# BROKEN here would be a defect (missing file / no summary line); RED is the TDD-red evidence.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG="${LOG:?set LOG}" \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:24:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
