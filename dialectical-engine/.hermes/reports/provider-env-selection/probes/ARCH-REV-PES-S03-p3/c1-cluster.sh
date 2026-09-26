#!/bin/zsh
# ARCH-REV-PES-S03-p3 · PLAN §3 S03-C1 command, literal relative runner, at base in the lane.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p3/c1-cluster.log
export LOG
zsh .claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-provider-credential-files.test.ts:24:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0
echo "script_rc=$?"
