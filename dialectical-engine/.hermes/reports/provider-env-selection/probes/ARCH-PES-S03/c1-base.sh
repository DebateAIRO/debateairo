#!/bin/zsh
# ARCH-PES-S03 · base run of the S03-C1 cluster command, in the slice lane, nothing written there.
# Pairs are the intake baseline (00-intake.md:40 / logs/baselines.tsv):
#   tests/unit/v9-provider-credential-files.test.ts        23/0
#   tests/architecture/vps-deployment-baseline.test.ts     31/0
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG="${LOG:?set LOG}" \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:23:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
