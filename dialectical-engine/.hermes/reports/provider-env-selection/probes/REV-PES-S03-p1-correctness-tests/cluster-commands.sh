#!/bin/zsh
# REV-PES-S03-p1-correctness-tests — re-run PLAN §3 cluster commands at HEAD.
# C1 and C2 are expected CLUSTER_RED at the slice head (later clusters raised the v9 count).
# C3 is expected CLUSTER_GREEN. Acceptance step 2 follows, as one vitest invocation.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-correctness-tests
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
CAPTURE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh
echo $$ > "$ROOT/cluster-commands.pid"
echo "start $(date '+%F %T %Z') pid=$$ HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"

run_cluster() {
  local name="$1"
  shift
  local log="$ROOT/${name}.log"
  echo "RUN $name $(date '+%T') log=$log"
  LOG="$log" zsh "$RUNNER" "$@"
  echo "DONE $name rc=$? $(date '+%T')"
}

run_cluster c1 \
  tests/unit/v9-provider-credential-files.test.ts:24:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
run_cluster c2 \
  tests/unit/v9-provider-credential-files.test.ts:28:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
run_cluster c3 \
  tests/unit/v9-provider-credential-files.test.ts:31:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0

echo "RUN accept-step2 $(date '+%T')"
LOG="$ROOT/accept-step2.log" zsh "$CAPTURE" pnpm vitest run \
  tests/unit/v9-provider-credential-files.test.ts \
  tests/architecture/vps-deployment-baseline.test.ts
echo "DONE accept-step2 rc=$? $(date '+%T')"
rm -f "$ROOT/cluster-commands.pid"
echo "cluster-commands-finished $(date '+%F %T %Z')"
