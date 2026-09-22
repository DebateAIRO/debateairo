#!/bin/bash
# CODE-REV-S02-C9 r1 — run_c9 exactly as the PLAN writes it (PLAN.md:1376-1418),
# plus the ORCHESTRATOR's PROPERTY, plus a commit column.
# LANE comes from argv (COMMON 10.35) — no hard-coded .worktrees path.
LANE="${1:?usage: run_c9.sh <lane-dir-holding-package.json> [runs]}"
RUNS="${2:-3}"
cd "$LANE" || exit 99

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  echo "$id | vt=$vt guard=$guard VERDICT=$v | $sum | $fil"
}

run_c9() {
  n="$1"; shift
  run S02-C9 "$n" "$@"; rc=$?
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)
  echo "S02-C9 | mergeArms: --scrim:=$s01 (expect 2)  S02markers=$s02 (expect 2)"
  [ "$rc" -eq 0 ] && [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
}

# The PROPERTY the two arms exist for (orchestrator's, transcribed).
property() {
  css=apps/ui/app/globals.css
  scrim=$(grep -c -- '--scrim:' "$css")
  s01o=$(grep -c -F -- '/* === consent-ui S01 === */' "$css")
  s01e=$(grep -c -F -- '/* === end consent-ui S01 === */' "$css")
  s02o=$(grep -c -F -- '/* === consent-ui S02 === */' "$css")
  s02e=$(grep -c -F -- '/* === end consent-ui S02 === */' "$css")
  ls01e=$(grep -n -F -- '/* === end consent-ui S01 === */' "$css" | cut -d: -f1 | head -1)
  ls02o=$(grep -n -F -- '/* === consent-ui S02 === */' "$css" | cut -d: -f1 | head -1)
  ls02e=$(grep -n -F -- '/* === end consent-ui S02 === */' "$css" | cut -d: -f1 | head -1)
  total=$(wc -l < "$css" | tr -d ' ')
  after=$((total - ls02e))
  ord=BAD; [ -n "$ls01e" ] && [ -n "$ls02o" ] && [ "$ls01e" -lt "$ls02o" ] && ord=OK
  pv=1
  [ "$scrim" -ge 1 ] && [ "$s01o" -eq 1 ] && [ "$s01e" -eq 1 ] && [ "$s02o" -eq 1 ] \
    && [ "$s02e" -eq 1 ] && [ "$ord" = OK ] && [ "$after" -eq 0 ] && pv=0
  echo "S02-C9 | PROPERTY: scrim=$scrim(>=1) S01open=$s01o/1 S01end=$s01e/1 S02open=$s02o/1 S02end=$s02e/1 S01endBeforeS02open=$ord linesAfterS02end=$after (file $total lines) | PROPERTY_VERDICT=$pv"
}

FILES="tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts"

echo "shell=$0 (bash $BASH_VERSION)  grep=$(grep --version 2>&1 | head -1)  LC_ALL=${LC_ALL:-unset}"
i=1
while [ "$i" -le "$RUNS" ]; do
  echo "--- run $i | commit $(git rev-parse --short HEAD) | porcelain $(git status --porcelain | wc -l | tr -d ' ') ---"
  run_c9 10 $FILES; aw=$?
  echo "S02-C9 | run_c9 AS WRITTEN VERDICT=$aw"
  property
  i=$((i+1))
done
