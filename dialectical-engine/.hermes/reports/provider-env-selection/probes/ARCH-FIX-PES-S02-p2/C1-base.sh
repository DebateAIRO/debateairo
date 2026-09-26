#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — revision 2 re-run of cluster S02-C1's ONE command, run at base 776359c3 in the S02 lane (read-only).
# The pairs are the AFTER-C1 targets, so a base run is expected to print CLUSTER_RED (TDD-RED):
# v9 201/0 vs 203/0 (two cases added by S02-S02), dev-api-environment 9/1 vs 11/1 (two added by S02-S03; at the §3 RED event 10/2, N1),
# dev-api-process 5/5 vs 6/5 (one added by S02-S04). Every other suite must already sit at its pair (register-support-publication 14/1: its :475 case is RED at base, unrelated — run1 measured it).
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2/C1-base.log \
zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/register-support-publication.test.ts:14:1
echo "lane: HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d " ")"
