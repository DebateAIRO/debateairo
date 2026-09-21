#!/bin/zsh
# Pass-2 mutation campaign at slice head c358d494. Each mutant restored FROM its capture.
set -u
S=${0:A:h}
export WORKTREE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
export MUTANT_OUT=$S/M
export RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
mkdir -p "$MUTANT_OUT"
U=(tests/unit/fpd-s01-c2-auto-publish.test.ts:14:0 tests/unit/fpd-s01-c3-unpublish-http.test.ts:11:0 tests/unit/fpd-s01-c4-erasure-http.test.ts:8:0 tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s8-publication.test.ts:26:0)
I=(tests/integration/fpd-s01-c1-binding.test.ts:9:0 tests/integration/fpd-s01-c2-system-publication.test.ts:20:0 tests/integration/fpd-s01-c4-delete-published.test.ts:17:0)
API=apps/api/src/index.ts
PUB=apps/api/src/publications.ts
DBP=packages/db/src/publication.ts
M69=migrations/0069_fix_bound_erasure_and_trigger.sql
M70=migrations/0070_fix_system_publication.sql
run() { $S/mutant.sh "$@" }
run T10p2 $PUB $S/lit/T10.old $S/lit/T10.new $U
run T8p2  $API $S/lit/T8.old  $S/lit/T8.new  $U
run G1    $PUB $S/lit/G1.old  $S/lit/G1.new  $U
run G3    $PUB $S/lit/G3.old  $S/lit/G3.new  $U
run G4    $API $S/lit/G4.old  $S/lit/G4.new  $U
run G2    $DBP $S/lit/G2.old  $S/lit/G2.new  $I
run G5    $M69 $S/lit/G5.old  $S/lit/G5.new  $I
run G9    $M69 $S/lit/G9.old  $S/lit/G9.new  $I
run G10   $M69 $S/lit/G10.old $S/lit/G10.new $I
run G6    $M70 $S/lit/G6.old  $S/lit/G6.new  $I
run G7    $M70 $S/lit/G7.old  $S/lit/G7.new  $I
run G8    $M70 $S/lit/G8.old  $S/lit/G8.new  $I
echo "### BATCH_P2_DONE"
