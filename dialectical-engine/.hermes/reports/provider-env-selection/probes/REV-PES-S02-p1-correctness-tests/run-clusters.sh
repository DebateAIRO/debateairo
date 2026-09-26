#!/bin/zsh
# REV-PES-S02-p1-correctness-tests: re-run every PLAN §3 cluster command (V1) + typecheck (V4) at the slice head.
# Usage: WORKTREE=<lane dialectical-engine dir> OUT=<dir> zsh run-clusters.sh <tag>
set -u
export PATH="/opt/homebrew/bin:$PATH"
unset FORCE_COLOR NO_COLOR
W=${WORKTREE:?WORKTREE required}; O=${OUT:?OUT required}; T=${1:-run}
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts
cd "$W" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ') $(date '+%F %T')"
LOG=$O/$T-C1.log zsh $R/run-suites.sh \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/register-support-publication.test.ts:14:1
LOG=$O/$T-C2.log zsh $R/run-suites.sh acceptance/pes-s02-fake-vendor.test.ts:6:0
LOG=$O/$T-C3.log zsh $R/run-suites.sh acceptance/pes-s02-hosted.test.ts:8:0
