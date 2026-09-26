#!/bin/zsh
# ARCH-PES-S02 — throwaway probe for the TRUST negative control's cause code (literal 127.0.0.1 vs hostname). Lane read-only.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S02
LOG="$P/spike-negative-control-ip.log" zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh pnpm exec tsx "$P/spike-negative-control-ip.ts"
