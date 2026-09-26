#!/bin/zsh
# ARCH-PES-S01 · `pnpm typecheck` at base in the S01 lane; the verdict is the per-file diagnostic set, never rc.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-typecheck.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh pnpm typecheck
echo "--- per-file diagnostic set (the delta oracle):"
grep -E '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-typecheck.log | sed -E 's/\([0-9]+,[0-9]+\).*//' | sort | uniq -c
