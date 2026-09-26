#!/bin/zsh
# ARCH-PES-S02 — base feasibility spike (throwaway). Runs in the S02 lane, read-only; writes only the LOG below.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S02
LOG="$P/spike-hosted-chain.log" zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  pnpm exec tsx "$P/spike-hosted-chain.ts"
