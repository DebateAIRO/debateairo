#!/bin/zsh
# ARCH-REV-PES-S02-p2 — the §3 commands themselves, on paths the plan creates.
# A missing file must be BROKEN (run-suites.sh), which is why §3 omits them from the base run.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S02-p2
echo "HEAD $(git rev-parse --short HEAD) dirty-before $(git status --porcelain | wc -l | tr -d ' ')"
echo "== C2 command"
LOG=$Q/C2-broken.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  acceptance/pes-s02-fake-vendor.test.ts:6:0
echo "== C3 command"
LOG=$Q/C3-broken.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  acceptance/pes-s02-hosted.test.ts:8:0
echo "dirty-after $(git status --porcelain | wc -l | tr -d ' ')"
