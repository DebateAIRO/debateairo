#!/bin/zsh
# Pass B — integration suites: pass-A survivors + every SQL mutant. Slice head db4758da.
set -u
S=${0:A:h}
export WORKTREE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine
export MUTANT_OUT=$S/B
export RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
mkdir -p "$MUTANT_OUT"
I=(tests/integration/fpd-s01-c1-binding.test.ts:9:0 tests/integration/fpd-s01-c1-privileges.test.ts:3:0 tests/integration/fpd-s01-c2-system-publication.test.ts:16:0 tests/integration/fpd-s01-c4-delete-published.test.ts:14:0)
API=apps/api/src/index.ts
PUB=apps/api/src/publications.ts
M66=migrations/0066_free_public_rule.sql
M67=migrations/0067_system_run_publication.sql
M68=migrations/0068_bound_published_erasure.sql
run() { $S/mutant.sh "$@" }
run T8i $API $S/lit/T8.old  $S/lit/T8.new  $I
run T10i $PUB $S/lit/T10.old $S/lit/T10.new $I
run S1  $M66 $S/lit/S1.old $S/lit/S1.new $I
run S2  $M66 $S/lit/S2.old $S/lit/S2.new $I
run S3  $M67 $S/lit/S3.old $S/lit/S3.new $I
run S4  $M67 $S/lit/S4.old $S/lit/S4.new $I
run S5  $M67 $S/lit/S5.old $S/lit/S5.new $I
run S6  $M67 $S/lit/S6.old $S/lit/S6.new $I
run S7  $M68 $S/lit/S7.old $S/lit/S7.new $I
run S8  $M68 $S/lit/S8.old $S/lit/S8.new $I
run S9  $M68 $S/lit/S9.old $S/lit/S9.new $I
echo "### BATCH_B_DONE"
