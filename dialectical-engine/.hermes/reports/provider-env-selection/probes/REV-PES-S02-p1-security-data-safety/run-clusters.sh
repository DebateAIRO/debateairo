#!/bin/zsh
# REV-PES-S02-p1-security-data-safety — re-run every PLAN §3 cluster command at the slice head.
# Usage: zsh run-clusters.sh <worktree dialectical-engine dir> <run-label>
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:?worktree}"; RUN="${2:?label}"
P="$(cd "$(dirname "$0")" && pwd)"
RS=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
cd "$WT" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ') $(date '+%F %T %Z')"
echo "== C1"; LOG="$P/C1-$RUN.log" zsh "$RS" \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/register-support-publication.test.ts:14:1
echo "== C2"; LOG="$P/C2-$RUN.log" zsh "$RS" acceptance/pes-s02-fake-vendor.test.ts:6:0
echo "== C3"; LOG="$P/C3-$RUN.log" zsh "$RS" acceptance/pes-s02-hosted.test.ts:8:0
echo "== ports 4460-4499 after"; lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "lsof rc=$?"
echo "dirty after $(git status --porcelain | wc -l | tr -d ' ')"
