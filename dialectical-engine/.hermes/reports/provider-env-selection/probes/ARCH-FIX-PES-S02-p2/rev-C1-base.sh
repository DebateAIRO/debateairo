#!/bin/zsh
# ARCH-REV-PES-S02-p1 — re-run S02-C1's command at base. Does not overwrite the ARCH seat's logs.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2/rev-C1-base.log \
zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/register-support-publication.test.ts:14:1
