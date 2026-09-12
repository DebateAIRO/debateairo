#!/bin/zsh
# REV-S02-p2-correctness-tests — the pass-1 pre-0061 detector with its green marker repaired.
# Closes t_35e0669f: the pass-1 script
# (REV-S02-p1-correctness-tests-pre-0061-schema.sh:39) printed "B1 ABSENT" and exited 0 on
# hits==0 ALONE, so a suite that was RED for any other reason (or a run that crashed before
# the failures printed) still read as green. Observed by FIX-S02-p1-F1 at 46/76, 74/76, 75/76.
# This version requires ALL of: rc=0 · Test Files 3 passed (3) · Tests 76 passed (76) · 0 hits.
#
# HEAD THIS WAS WRITTEN AGAINST: 88f8a01f. MEASURED THERE: rc=0, 3 files, 76/76, 0 hits.
# Changes nothing, restores nothing.
#
# THE FOURTH PAIR, named here because the pass-1 header said only "the fourth suite" and a
# packet then pointed at that name (REV-S02-p2-correctness-tests.md:25). It is NOT part of
# this class run and must be run separately:
#   pnpm exec vitest run tests/integration/database.test.ts \
#                        tests/integration/s7-authorization-database.test.ts
# MEASURED at 88f8a01f: rc=1 · Test Files 2 failed (2) · Tests 2 failed | 70 passed (72),
# both failures PRE-EXISTING and named in BASELINE-dated evidence:
#   database.test.ts > apps/runner — legal command lifecycle > claims, judges through the
#     HTTP gateway, propagates, serves, and settles
#   s7-authorization-database.test.ts > S7 real PostgreSQL ownership and IDOR boundary >
#     locks every matching run before allocation while a rejected transfer is queued
# The third failure pass 1 measured there ("fails closed and rolls migration 0037 back when
# any pre-S7 immutable run contains a raw user id") is GONE at this head.
#
# Usage:  zsh <this file> [<worktree root>]   |   WORKTREE=/abs/path zsh <this file>
set -u
ROOT="${1:-${WORKTREE:-$PWD}}"
cd "$ROOT" || { echo "PROBE BROKEN: cannot cd to $ROOT"; exit 2; }
[[ -f package.json && -d migrations ]] || { echo "PROBE BROKEN: $ROOT is not a repo root"; exit 2; }
LOG="${LOG:-${TMPDIR:-/tmp}/rev-s02-p2-pre-0061.log}"
CLASS=(
  tests/integration/s6-content-encryption-database.test.ts
  tests/integration/s9-dev-token-retirement-database.test.ts
  tests/integration/register-support-publication.test.ts
)
echo "PROBE pre-0061-schema-strict · root $ROOT · head $(git rev-parse --short HEAD 2>/dev/null)"
pnpm exec vitest run "${CLASS[@]}" > "$LOG" 2>&1
RC=$?
/usr/bin/grep -E '^[[:space:]]*(Test Files|Tests)' "$LOG"
HITS=$(/usr/bin/grep -c 'column "plan_tier" of relation "run" does not exist' "$LOG")
FILES=$(/usr/bin/grep -cE '^[[:space:]]*Test Files[[:space:]]+3 passed \(3\)' "$LOG")
TESTS=$(/usr/bin/grep -cE '^[[:space:]]*Tests[[:space:]]+76 passed \(76\)' "$LOG")
echo "rc=$RC · 42703 hits=$HITS · files_marker=$FILES · tests_marker=$TESTS · full log $LOG"
if [[ "$HITS" -gt 0 ]]; then
  echo "B1 PRESENT — startRun requires migration 0061; see packages/db/src/index.ts:1259-1288"
  exit 1
fi
if [[ "$RC" -ne 0 || "$FILES" -ne 1 || "$TESTS" -ne 1 ]]; then
  echo "PROBE INCONCLUSIVE — no 42703 hit, but the class suite did not end 3 files / 76 passed / rc=0"
  exit 2
fi
echo "B1 ABSENT on this head"
exit 0
