#!/bin/zsh
set -u
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
OUT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p3-correctness-tests/scratch
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
cd "$WT" || exit 2
GATE=(
  tests/integration/fpd-s01-c1-binding.test.ts:9:0
  tests/integration/fpd-s01-c1-privileges.test.ts:3:0
  tests/unit/fpd-s01-c2-auto-publish.test.ts:14:0
  tests/integration/fpd-s01-c2-system-publication.test.ts:20:0
  tests/unit/fpd-s01-c3-unpublish-http.test.ts:11:0
  tests/unit/fpd-s01-c4-erasure-http.test.ts:8:0
  tests/integration/fpd-s01-c4-delete-published.test.ts:17:0
  tests/unit/s8-publication.test.ts:26:0
  tests/unit/s8-publication-http.test.ts:4:0
  tests/integration/s8-publication-database.test.ts:25:1
  tests/architecture/s8-publication-contract.test.ts:4:1
  tests/unit/s7-authorization.test.ts:30:1
  tests/unit/s10-erasure-http.test.ts:8:0
  tests/unit/pda-s04-node-carrier-audit.test.ts:2:0
  tests/unit/tiers-s02-admission.test.ts:15:0
  tests/integration/tiers-s02-run-plan-tier.test.ts:6:0
  tests/integration/plan-tiers-route-privileges.test.ts:1:0
  tests/architecture/register-support-publication.test.ts:12:2
  tests/unit/api.test.ts:31:0
  tests/integration/dev-database-principals.test.ts:16:0
  tests/integration/fpd-s01-l1-boot-role-assertions.test.ts:1:0
)
echo "### GATE ambient"; env -u LANG -u LC_ALL zsh -c "LOG=$OUT/gate-ambient.log $RUNNER ${GATE[*]}"
echo "### GATE utf8";    LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 zsh -c "LOG=$OUT/gate-utf8.log $RUNNER ${GATE[*]}"
echo "### SKIP SCAN"; /usr/bin/grep -cE '^[[:space:]]*Tests.*skipped' $OUT/gate-ambient.log $OUT/gate-utf8.log
echo "### CLASS SWEEP (charge 6) — migrating + role-attesting suites NOT in the gate, once each"
CLASS=(
  tests/integration/production-database-principals.test.ts
  tests/integration/support-config-principals.test.ts
  tests/integration/s6-content-encryption-database.test.ts
  tests/integration/s7-authorization-database.test.ts
  tests/integration/dev-deployment-register.test.ts
  tests/integration/support-shred.test.ts
  tests/integration/registration-database.test.ts
  tests/integration/session-database.test.ts
  tests/integration/p2-auth-risk-database.test.ts
  tests/integration/p2-recovery-start-database.test.ts
  tests/integration/register-support-publication.test.ts
  tests/architecture/sup-01-boundary.test.ts
)
for f in $CLASS; do
  o=$(LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run "$f" 2>&1)
  printf '%s\n' "===== $f =====" >> $OUT/class-sweep.log
  printf '%s\n' "$o" >> $OUT/class-sweep.log
  s=$(printf '%s\n' "$o" | /usr/bin/grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  echo "$f :: ${s:-NO_SUMMARY}"
done
echo "### P3_RUNS_DONE"
