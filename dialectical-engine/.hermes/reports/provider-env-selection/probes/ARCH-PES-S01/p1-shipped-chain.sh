#!/bin/zsh
# ARCH-PES-S01 probe p1 runner — the shipped R1.2/R1.3/R1.7 chain, pure (no database, no listener).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p1-shipped-chain.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  pnpm exec tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p1-shipped-chain.ts
