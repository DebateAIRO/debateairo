#!/bin/zsh
# ARCH-PES-S01 · measures, at base in the S01 lane, the two suites this plan adds to cluster commands that the
# intake's 36-suite baseline does not carry. Placeholder pairs 0:0 — the per-suite line is the measurement.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/measure-unlisted.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-configured-provider-set-deployment.test.ts:0:0 \
  tests/unit/text-control-bytes.test.ts:0:0
