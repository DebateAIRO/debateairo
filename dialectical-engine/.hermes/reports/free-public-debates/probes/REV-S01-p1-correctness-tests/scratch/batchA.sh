#!/bin/zsh
# Pass A — unit/HTTP suites only, every mutant. Slice head db4758da.
set -u
S=${0:A:h}
export WORKTREE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
export MUTANT_OUT=$S/A
export RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
mkdir -p "$MUTANT_OUT"
U=(tests/unit/fpd-s01-c2-auto-publish.test.ts:8:0 tests/unit/fpd-s01-c3-unpublish-http.test.ts:10:0 tests/unit/fpd-s01-c4-erasure-http.test.ts:8:0 tests/unit/s8-publication.test.ts:26:0 tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s10-erasure-http.test.ts:8:0)
API=apps/api/src/index.ts
PUB=apps/api/src/publications.ts
run() { $S/mutant.sh "$@" }
run T1  $API $S/lit/T1.old  $S/lit/T1.new  $U
run T2  $PUB $S/lit/T2.old  $S/lit/T2.new  $U
run T3  $PUB $S/lit/T3.old  $S/lit/T3.new  $U
run T4  $PUB $S/lit/T4.old  $S/lit/T4.new  $U
run T5  $PUB $S/lit/T5.old  $S/lit/T5.new  $U
run T6  $API $S/lit/T6.old  $S/lit/T6.new  $U
run T7  $API $S/lit/T7.old  $S/lit/T7.new  $U
run T8  $API $S/lit/T8.old  $S/lit/T8.new  $U
run T10 $PUB $S/lit/T10.old $S/lit/T10.new $U
run T11 $PUB $S/lit/T11.old $S/lit/T11.new $U
echo "### BATCH_A_DONE"
