#!/bin/zsh
# ARCH-REV-S01-03: every cluster command of PLAN Revision 3, at base in the lane. New fpd-s01-* paths omitted (§8).
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
D="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-REV-S01-03"
cd "$LANE"
echo "### C1"; LOG="$D/rev3-c1-scripted.log" "$RUNNER" tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0
echo "### C2"; LOG="$D/rev3-c2-scripted.log" "$RUNNER" tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1
echo "### C3"; LOG="$D/rev3-c3-scripted.log" "$RUNNER" tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1
echo "### C4"; LOG="$D/rev3-c4-scripted.log" "$RUNNER" tests/unit/s10-erasure-http.test.ts:8:0
echo "### lane dirty"; git -C "$LANE" status --porcelain | wc -l
