#!/bin/bash
# ARCH-REV-S02 round 3 — all nine cluster commands, transcribed by ME from PLAN.md's
# §The cluster map (round-3 text), plus the satisfiability matrix COMMON §10.16 demands.
# Read-only: nothing in the lane is written.
export LC_ALL=C
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine || exit 9
echo "### lane: $(pwd)"
echo "### HEAD: $(git rev-parse --short HEAD)  branch: $(git rev-parse --abbrev-ref HEAD)"
echo "### porcelain BEFORE: $(git status --porcelain | wc -l | tr -d ' ') entries"
echo "### grep: $(grep --version | head -1)  LC_ALL=$LC_ALL"

classify() {   # $1 = captured output ; COMMON §10.17: classify by CAUSE
  b=$(printf '%s' "$1" | grep -cE 'unexpected argument|usage:|command not found|Unknown option')
  m=$(printf '%s' "$1" | grep -cE 'Cannot find module|Failed to resolve import')
  n=$(printf '%s' "$1" | grep -c 'No test files found')
  echo "brokenSigs=$b cannotFindModule=$m noTestFiles=$n"
}

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  echo "$id | vt=$vt guard=$guard VERDICT=$v | $(classify "$out")  | ${sum:-<no Tests line>} | ${fil:-<no Test Files line>}"
  LAST_OUT="$out"
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

echo; echo "=== PART 1 — the nine commands AT BASE ==="
run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx
run S02-C7 5 tests/render/consent-signup-modal.test.tsx tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts

echo; echo "=== PART 2 — SATISFIABILITY: the guard fed a known-GOOD synthetic capture (MUST be 0) ==="
guardonly() {  # $1 = synthetic capture, $2 = n
  sum=$(printf '%s' "$1" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$1" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed"; t1=$?
  printf '%s' "$sum" | grep -q 'failed'; t2=$( [ $? -eq 0 ] && echo 1 || echo 0 )
  printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${2} passed \(${2}\)"; t3=$?
  v=0; { [ $t1 -ne 0 ] || [ $t2 -ne 0 ] || [ $t3 -ne 0 ]; } && v=1
  echo "   T1=$t1 T2=$t2 T3=$t3  GUARD=$v   <- $3"
}
GOOD5=' Test Files  5 passed (5)
      Tests  13 passed (13)
   Start at  22:10:00'
GOOD4=' Test Files  4 passed (4)
      Tests  25 passed (25)'
GOOD10=' Test Files  10 passed (10)
      Tests  61 passed (61)'
guardonly "$GOOD5" 5 "A: C7-shaped green, n=5 (the round-3 file set)"
guardonly "$GOOD4" 4 "B: C4-shaped green, n=4"
guardonly "$GOOD10" 10 "C: C9-shaped green, n=10"
echo "   -- one mutant per term, each MUST flip the guard to 1 --"
guardonly ' Test Files  5 passed (5)
      Tests  0 passed (0)' 5 "T1 mutant: zero pass count"
guardonly '  x tests/render/x.test.tsx > Tests 13 passed (13) is in a TITLE
 Test Files  5 passed (5)' 5 "T1 mutant: the words inside a test TITLE, not anchored"
guardonly ' Test Files  5 passed (5)
      Tests  1 failed | 12 passed (13)' 5 "T2 mutant: a failure in the summary"
guardonly ' Test Files  4 passed (4)
      Tests  13 passed (13)' 5 "T3 mutant: VARIANT 7 — 4 of 5 files ran, exit 0"
guardonly '      Tests  13 passed (13)' 5 "T3 mutant: Test Files line absent entirely"

echo; echo "=== PART 3 — the glyph trap (COMMON §10.16), same term, script vs inline ==="
CAP=' ✓ tests/render/consent-signup-modal.test.tsx (13 tests) 40ms'
echo "   glyph-matching term (^ . tests/) hits HERE (BSD grep, LC_ALL=C): $(printf '%s\n' "$CAP" | grep -c '^ . tests/')"
echo "   ASCII test-path term hits                                     : $(printf '%s\n' "$CAP" | grep -c 'tests/render/consent-signup-modal.test.tsx')"
echo "   any term in the PLAN's idiom matching a glyph                 : $(grep -c "grep -qE .*[✓×]" /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/PLAN.md)"

echo; echo "### porcelain AFTER: $(git status --porcelain | wc -l | tr -d ' ') entries"
