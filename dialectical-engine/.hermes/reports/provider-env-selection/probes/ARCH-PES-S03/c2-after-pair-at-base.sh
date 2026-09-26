#!/bin/zsh
# ARCH-PES-S03 · the S03-C2 CLUSTER COMMAND (its AFTER pair) run at base.
# Revision 2: C2's four document-fact cases land in v9, NOT in the kit baseline suite,
# so SPEC §5 step 2 ("the reported pair for vps-deployment-baseline.test.ts is its base
# pair") holds literally — the kit suite stays byte-identical at 31/31.
# Expected at base: CLUSTER_RED — v9 reads 23/0 where the cluster expects 28/0.
# BROKEN here would be a defect; RED is the TDD-red evidence.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG="${LOG:?set LOG}" \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:28:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
