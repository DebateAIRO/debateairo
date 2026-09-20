#!/bin/zsh
# ARCH-REV-S01-02: every cluster command of PLAN Revision 2, run at base in the lane.
# TDD-created paths omitted (PLAN §8): the 7 new fpd-s01-* files.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
D="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-REV-S01-02"
cd "$LANE"
echo "### C1"; LOG="$D/rev2-c1.log" "$RUNNER" tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0
echo "### C2"; LOG="$D/rev2-c2.log" "$RUNNER" tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1
echo "### C3"; LOG="$D/rev2-c3.log" "$RUNNER" tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1
echo "### C4"; LOG="$D/rev2-c4.log" "$RUNNER" tests/unit/s10-erasure-http.test.ts:8:0
echo "### lane dirty"; git -C "$LANE" status --porcelain | wc -l
