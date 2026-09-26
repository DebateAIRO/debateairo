#!/bin/zsh
# ARCH-PES-S01 · base run of the WHOLE tests/architecture directory in the S01 lane (read-only).
# Purpose: the base totals + failing-name set REV(S01) compares against (verification list item V4).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-architecture-dir.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  pnpm exec vitest run tests/architecture
