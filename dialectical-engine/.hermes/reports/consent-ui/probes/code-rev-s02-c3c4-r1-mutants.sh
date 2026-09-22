#!/bin/bash
# CODE-REV-S02-C3C4 r1 — mutant campaign. Every mutant is planted in the worktree,
# both cluster commands are run, and the file is HARD-reverted before the next one.
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine
cd "$LANE" || exit 99
SRC=apps/ui/components/SignUpFlow.tsx

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  names=$(printf '%s' "$out" | grep -E '^[[:space:]]*FAIL[[:space:]]' | sed 's/^ *FAIL *//' | sort -u | head -8)
  echo "    $id VERDICT=$v |$sum |$fil"
  [ -n "$names" ] && printf '      failed: %s\n' "$names"
}

c3() { run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts; }
c4() { run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts; }

plant() { # $1 = python replace expression file
  python3 "$1" || { echo "PLANT FAILED"; return 1; }
}
revert() { git checkout HEAD -- "$SRC"; s=$(git status --porcelain -- "$SRC" | wc -l | tr -d ' '); echo "    reverted; porcelain(SRC)=$s"; }

mutant() { # $1 = label, $2 = python file
  echo "=== MUTANT $1 ==="
  plant "$2" || return
  c3; c4
  revert
}

D=$(dirname "$0")
for m in "$D"/m*.py; do
  mutant "$(basename "$m" .py)" "$m"
done

echo "=== FINAL porcelain (tracked) ==="
git status --porcelain | grep -v '^?? .review-scratch' | wc -l
