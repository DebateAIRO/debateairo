#!/bin/zsh
# ARCH-PES-S01 probe p2 runner — embedded PostgreSQL on an OS-assigned port; seeds v4, publishes hosted, stops.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
lsof -nP -iTCP:55432 -sTCP:LISTEN > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p2-lsof-55432-before.txt 2>&1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p2-scratch-db.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  pnpm exec tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p2-scratch-db.ts
lsof -nP -iTCP:55432 -sTCP:LISTEN > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/p2-lsof-55432-after.txt 2>&1
