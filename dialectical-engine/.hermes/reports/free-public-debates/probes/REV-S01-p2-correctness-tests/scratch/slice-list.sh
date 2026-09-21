#!/bin/zsh
set -u
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
OUT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p2-correctness-tests/scratch
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
TAG=${1:?tag}
cd "$WT" || exit 2
LOG=$OUT/slice-$TAG.log $RUNNER \
  tests/integration/fpd-s01-c1-binding.test.ts:9:0 \
  tests/integration/fpd-s01-c1-privileges.test.ts:3:0 \
  tests/unit/fpd-s01-c2-auto-publish.test.ts:14:0 \
  tests/integration/fpd-s01-c2-system-publication.test.ts:20:0 \
  tests/unit/fpd-s01-c3-unpublish-http.test.ts:11:0 \
  tests/unit/fpd-s01-c4-erasure-http.test.ts:8:0 \
  tests/integration/fpd-s01-c4-delete-published.test.ts:17:0 \
  tests/unit/s8-publication.test.ts:26:0 \
  tests/unit/s8-publication-http.test.ts:4:0 \
  tests/integration/s8-publication-database.test.ts:25:1 \
  tests/architecture/s8-publication-contract.test.ts:4:1 \
  tests/unit/s7-authorization.test.ts:30:1 \
  tests/unit/s10-erasure-http.test.ts:8:0 \
  tests/unit/pda-s04-node-carrier-audit.test.ts:2:0 \
  tests/unit/tiers-s02-admission.test.ts:15:0 \
  tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 \
  tests/integration/plan-tiers-route-privileges.test.ts:1:0 \
  tests/architecture/register-support-publication.test.ts:12:2 \
  tests/unit/api.test.ts:31:0
echo "### SKIPPED CHECK $TAG"; /usr/bin/grep -cE '^\s*Tests.*skipped' $OUT/slice-$TAG.log
echo "### DONE $TAG"
