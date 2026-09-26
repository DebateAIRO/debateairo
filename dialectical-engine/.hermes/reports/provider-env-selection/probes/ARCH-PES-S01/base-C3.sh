#!/bin/zsh
# ARCH-PES-S01 · S01-C3 cluster command at BASE (776359c3). Created paths OMITTED (they do not exist until steps S01-16 / S01-17):
#   tests/integration/pes-s01-hosted-provider-set-publish.test.ts
#   tests/architecture/pes-s01-hosted-publish-boundary.test.ts
# The FINAL command carries tests/architecture:723:6 (base 719:6 plus the 4 cases step S01-17 creates); at base the pair is 719:6.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01/base-C3.log \
  zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture:719:6 \
  tests/integration/dev-deployment-register.test.ts:15:0 \
  tests/unit/text-control-bytes.test.ts:3:0
