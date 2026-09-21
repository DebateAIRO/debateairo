#!/bin/zsh
set -u
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
OUT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-correctness-tests/scratch
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
R=${1:?run number}
cd "$WT" || exit 2
echo "### C1 run $R"
LOG=$OUT/c1-run$R.log $RUNNER tests/integration/fpd-s01-c1-binding.test.ts:9:0 tests/integration/fpd-s01-c1-privileges.test.ts:3:0 tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0
echo "### C2 run $R"
LOG=$OUT/c2-run$R.log $RUNNER tests/unit/fpd-s01-c2-auto-publish.test.ts:8:0 tests/integration/fpd-s01-c2-system-publication.test.ts:16:0 tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1
echo "### C3 run $R"
LOG=$OUT/c3-run$R.log $RUNNER tests/unit/fpd-s01-c3-unpublish-http.test.ts:10:0 tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1
echo "### C4 run $R"
LOG=$OUT/c4-run$R.log $RUNNER tests/unit/fpd-s01-c4-erasure-http.test.ts:8:0 tests/integration/fpd-s01-c4-delete-published.test.ts:14:0 tests/unit/s10-erasure-http.test.ts:8:0
echo "### DONE run $R"
