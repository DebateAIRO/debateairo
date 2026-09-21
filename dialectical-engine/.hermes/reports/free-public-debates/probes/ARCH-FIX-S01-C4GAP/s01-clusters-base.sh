#!/bin/zsh
# ARCH-FIX-S01-C4GAP: cluster commands at lane HEAD 11184e70.
# Omit uncommitted C3/C4 TDD paths (working tree; packet: never read/write them).
# C1/C2 TDD paths exist at HEAD and are run.
set -u
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
RUNNER="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
D="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/ARCH-FIX-S01-C4GAP"
cd "$LANE"
echo "### C4 (omitted tests/unit/fpd-s01-c4-erasure-http.test.ts and tests/integration/fpd-s01-c4-delete-published.test.ts — uncommitted, created by C4-S1/S2)"
LOG="$D/s01-c4-base.log" "$RUNNER" tests/unit/s10-erasure-http.test.ts:8:0
echo "### C3 (omitted tests/unit/fpd-s01-c3-unpublish-http.test.ts — uncommitted)"
LOG="$D/s01-c3-base.log" "$RUNNER" tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1
echo "### C1 regression pair (landed C1 files not required for G1; run original ARCH-base pair)"
LOG="$D/s01-c1-base.log" "$RUNNER" tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0
echo "### C2 regression pair"
LOG="$D/s01-c2-base.log" "$RUNNER" tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1
echo "### lane dirty (must stay 4: C3/C4 uncommitted + index.ts; we write nothing)"
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01 status --porcelain | wc -l
