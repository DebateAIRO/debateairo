#!/bin/zsh
export PATH="/opt/homebrew/bin:$PATH"
failed_run=0
for run_number in 1 2 3; do
  run_log="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/FIX-PES-S03-p3/green-${run_number}.log"
  test ! -e "$run_log" || exit 2
  LOG="$run_log" zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/unit/v9-provider-credential-files.test.ts:33:0 tests/architecture/vps-deployment-baseline.test.ts:43:0 tests/unit/v30-support-provider.test.ts:30:0 || failed_run=1
done
exit "$failed_run"
