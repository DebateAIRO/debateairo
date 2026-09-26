#!/bin/zsh
# ARCH-REV-PES-S01-p1 · re-run S01-C3 at base. Created paths omitted (S01-16 / S01-17 create them):
#   tests/integration/pes-s01-hosted-provider-set-publish.test.ts
#   tests/architecture/pes-s01-hosted-publish-boundary.test.ts
# Final command expects tests/architecture:723:6; at base the directory pair is 719:6.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p1/base-C3.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/integration/dev-deployment-register.test.ts:15:0 \
  tests/unit/text-control-bytes.test.ts:3:0
