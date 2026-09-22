#!/bin/bash
# ARCH-REV-S02 round 2 — MY OWN re-run of all nine cluster commands, from the PLAN's own
# guard function transcribed verbatim from PLAN.md:1260-1270 and :1293-1300.
# COMMON §10.16: this file is executed by /bin/bash (BSD grep, C locale) AND the same
# body is run inline in the tool shell (ugrep). Both verdicts are reported.
export LC_ALL=C
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine || exit 9
echo "### shell: $0 | grep: $(grep --version 2>&1 | head -1) | LC_ALL=$LC_ALL"
echo "### pwd: $(pwd)  HEAD: $(git rev-parse --short HEAD)  porcelain: $(git status --porcelain | wc -l | tr -d ' ')"

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  # cause counters, classified per COMMON §10.17
  bs=$(printf '%s' "$out" | grep -ciE 'startup error|unexpected argument|failed to load|usage:|command not found')
  cfm=$(printf '%s' "$out" | grep -ciE 'cannot find module|failed to resolve import')
  ntf=$(printf '%s' "$out" | grep -ciE 'no test files found')
  echo "$id | vt=$vt guard=$guard VERDICT=$v | brokenSigs=$bs cannotFindModule=$cfm noTestFiles=$ntf"
  [ -n "$sum" ] && echo "$id | Tests    : $sum"
  [ -n "$fil" ] && echo "$id | TestFiles: $fil"
  [ -z "$sum" ] && echo "$id | raw     : $(printf '%s' "$out" | grep -iE 'no test files found' | head -1)"
  return $v
}
run_c9() {
  n="$1"; shift
  run S02-C9 "$n" "$@"; rc=$?
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)
  echo "S02-C9 | mergeArms: --scrim:=$s01 (expect 2)  S02markers=$s02 (expect 2)"
  [ "$rc" -eq 0 ] && [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
}

run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx
run S02-C7 5 tests/render/consent-signup-modal.test.tsx tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts

echo "### lane porcelain after: $(git status --porcelain | wc -l | tr -d ' ') entries"
