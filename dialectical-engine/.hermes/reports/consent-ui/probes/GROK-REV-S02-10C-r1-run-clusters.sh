#!/bin/bash
# GROK-REV-S02-10C r1 — cluster commands ×3 + standing gates.
# ASCII anchors only. Run under /bin/bash from the lane that holds package.json.
set -u
export LC_ALL=C
LANE="${LANE:-$(pwd)}"
cd "$LANE" || exit 2
OUTDIR="${OUTDIR:-$LANE/.review-scratch/GROK-REV-S02-10C-r1}"
mkdir -p "$OUTDIR"

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
  printf '%s\n' "$out" > "$OUTDIR/${id}.log"
}

run_c9() {
  n="$1"; shift
  run S02-C9 "$n" "$@"; rc=$?
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)
  echo "S02-C9 | mergeArms: --scrim:=$s01 (expect 2)  S02markers=$s02 (expect 2)"
  [ "$rc" -eq 0 ] && [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
}

echo "=== HEAD $(git rev-parse --short HEAD) ==="
echo "=== ADR arms (S02-S72) ==="
test -f docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md && echo EXISTS
echo -n "Status Proposed count: "
grep -c 'Status: Proposed' docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md
for s in useModalSurface backdropCloseHandler prefersReducedMotion openSurfaceCount; do
  echo -n "$s: "
  grep -c "$s" docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md
done

echo "=== CLUSTER COMMANDS ×3 ==="
for pass in 1 2 3; do
  echo "----- PASS $pass -----"
  run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
  run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
  run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
  run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx
  run S02-C7 5 tests/render/consent-signup-modal.test.tsx tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
  run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  echo "S02-C9-run_c9-exit=$?"
done

echo "=== STANDING GATES ==="
# G1 typecheck
genc=$(pnpm run generate:contract 2>&1); ge=$?
echo "G1 generate:contract exit=$ge"
tc=$(pnpm typecheck 2>&1); tt=$?
echo "G1 typecheck exit=$tt"
echo "$tc" > "$OUTDIR/G1-typecheck.log"
tsc_runs=$(printf '%s' "$tc" | grep -cE '^\$ tsc --noEmit$')
outside=$(printf '%s' "$tc" | grep -E 'error TS' | grep -v 'tests/unit/s14-ui.test.ts' | wc -l | tr -d ' ')
pin=$(printf '%s' "$tc" | grep -E 'error TS' | grep 'tests/unit/s14-ui.test.ts' | wc -l | tr -d ' ')
echo "G1 tsc_runs=$tsc_runs outside_pin=$outside pin_count=$pin (report, never assert)"

# G2 t9
t9=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1); t9e=$?
echo "$t9" > "$OUTDIR/G2-t9.log"
fail_lines=$(printf '%s' "$t9" | grep -cE '^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > ')
echo "G2 exit=$t9e fail_named_lines=$fail_lines"
printf '%s' "$t9" | grep -E '^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > ' || true
hits=$(printf '%s' "$t9" | grep -cE '^\+ +"/.*:[0-9]+:')
echo "G2 hit_list_count=$hits"
printf '%s' "$t9" | grep -E '^\+ +"/.*:[0-9]+:' || true
printf '%s' "$t9" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1

# G3
run G3 1 tests/unit/v2ui-node-runner.test.ts

echo "=== apps/ui tsc (COMMON §10.30) ==="
(cd apps/ui && npx tsc --noEmit -p tsconfig.json); echo "apps/ui tsc exit=$?"

echo "=== 17-file SET (BASELINE.md command) ×3 ==="
for pass in 1 2 3; do
  echo "----- SET pass $pass -----"
  setout=$(pnpm exec vitest run tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts 2>&1); se=$?
  ssum=$(printf '%s' "$setout" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  sfil=$(printf '%s' "$setout" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  echo "SET pass=$pass exit=$se | $ssum | $sfil"
  printf '%s\n' "$setout" > "$OUTDIR/SET-pass${pass}.log"
done

echo "=== DONE ==="
