#!/bin/zsh
# PROBE — the whole-slice fixture REV(S02) p1 (lens correctness/tests) wrote from the CLAIM:
# SPEC-v2 R3/R4/R6/R7/R9 + acceptance steps 6-7, on the panel today's dev stack actually produces.
# Written against slice head 9ef275aa (mission debate-tiers, slice S02).
#
# It COPIES REV-S02-p1-correctness-tests-slice-probe.test.ts into <root>/tests/unit/ (the fixture
# imports ../support/httpSession.js by relative path and can run nowhere else), runs it, then
# REMOVES exactly the file it copied — restoring FROM the state it captured, never to a literal:
# if that path already existed it is saved first and put back byte-for-byte.
#
# Usage:  zsh <this file> [<worktree root>]     |     WORKTREE=/abs/path zsh <this file>
# Expected at 9ef275aa: Test Files 1 passed (1) · Tests 7 passed (7) · rc=0.
set -u
ROOT="${1:-${WORKTREE:-$PWD}}"
HERE="${0:A:h}"
cd "$ROOT" || { echo "PROBE BROKEN: cannot cd to $ROOT"; exit 2; }
[[ -d tests/unit && -f tests/support/httpSession.ts ]] || { echo "PROBE BROKEN: $ROOT is not a repo root"; exit 2; }
TARGET="tests/unit/rev-s02-p1-correctness-probe.test.ts"
SAVED=""
if [[ -e "$TARGET" ]]; then SAVED=$(mktemp); cp "$TARGET" "$SAVED"; fi
cp "${HERE}/REV-S02-p1-correctness-tests-slice-probe.test.ts" "$TARGET"
pnpm exec vitest run "$TARGET" > "${LOG:-$PWD/.probe-slice.log}" 2>&1
RC=$?
/usr/bin/grep -E '^[[:space:]]*(Test Files|Tests)' "${LOG:-$PWD/.probe-slice.log}"
if [[ -n "$SAVED" ]]; then cp "$SAVED" "$TARGET"; rm -f "$SAVED"; else rm -f "$TARGET"; fi
echo "rc=$RC · restored · git status --porcelain lines: $(git status --porcelain | wc -l | tr -d ' ')"
exit $RC
