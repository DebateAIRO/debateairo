#!/bin/zsh
# PROBE — detector for REV(S02) p1 finding B1: `RunRepository.startRun` names `plan_tier`
# unconditionally, so every write against a schema older than migration 0061 fails with
# PostgreSQL 42703 (`column "plan_tier" of relation "run" does not exist`).
#
# Written against slice head 9ef275aa (mission debate-tiers, slice S02) by seat
# REV-S02-p1-correctness-tests. NOT a mutant: it changes nothing and restores nothing.
#
# The suites below are the members of the class found by
#   /usr/bin/grep -rn 'name < "' tests
# (suites that apply a TRUNCATED migration set and then write a run).
#
# Usage:  zsh <this file> [<worktree root>]
#         WORKTREE=/abs/path zsh <this file>
# Root resolution: argv[1], else $WORKTREE, else the current directory. Never hard-coded.
#
# Expected at a FIXED head:  Test Files 3 passed (3) · Tests 76 passed (76) · rc=0 · 0 hits.
# Measured at 9ef275aa:      Test Files 2 failed | 1 passed (3) · Tests 34 failed | 42 passed (76)
#                            rc=1 · 14 hits of the exact 42703 message.
# The fourth suite is reported separately because it carries two failures that are
# PRE-EXISTING (a lock-waiter race and a staleness projection) and must not be counted here.
set -u
ROOT="${1:-${WORKTREE:-$PWD}}"
cd "$ROOT" || { echo "PROBE BROKEN: cannot cd to $ROOT"; exit 2; }
[[ -f package.json && -d migrations ]] || { echo "PROBE BROKEN: $ROOT is not a repo root"; exit 2; }
LOG="${LOG:-$PWD/.probe-pre-0061-schema.log}"

CLASS=(
  tests/integration/s6-content-encryption-database.test.ts
  tests/integration/s9-dev-token-retirement-database.test.ts
  tests/integration/register-support-publication.test.ts
)
echo "PROBE pre-0061-schema · root $ROOT · head $(git rev-parse --short HEAD 2>/dev/null)"
pnpm exec vitest run "${CLASS[@]}" > "$LOG" 2>&1
RC=$?
/usr/bin/grep -E '^[[:space:]]*(Test Files|Tests)' "$LOG"
HITS=$(/usr/bin/grep -c 'column "plan_tier" of relation "run" does not exist' "$LOG")
echo "rc=$RC · 42703 hits=$HITS · full log $LOG"
if [[ "$HITS" -gt 0 ]]; then
  echo "B1 PRESENT — startRun requires migration 0061; see packages/db/src/index.ts:1248"
  exit 1
fi
echo "B1 ABSENT on this head"
exit 0
