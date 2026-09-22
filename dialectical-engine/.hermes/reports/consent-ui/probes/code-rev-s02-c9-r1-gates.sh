#!/bin/bash
# CODE-REV-S02-C9 r1 — the standing gates, reported as DELTAS. LANE from argv.
LANE="${1:?lane}"; cd "$LANE" || exit 99
echo "commit=$(git rev-parse --short HEAD) porcelain=$(git status --porcelain | wc -l | tr -d ' ')"
echo "=== G0 generate:contract ==="
gc=$(pnpm run generate:contract 2>&1); echo "exit=$?"; echo "porcelain after: $(git status --porcelain | wc -l | tr -d ' ')"
echo "=== G1 root typecheck DELTA ==="
tc=$(pnpm typecheck 2>&1); tt=$?
echo "typecheck exit=$tt"
n_all=$(printf '%s\n' "$tc" | grep -cE '^[^ ]*\.tsx?\([0-9]+,[0-9]+\): error TS')
n_out=$(printf '%s\n' "$tc" | grep -E '^[^ ]*\.tsx?\([0-9]+,[0-9]+\): error TS' | grep -vc 'tests/unit/s14-ui.test.ts')
echo "total diagnostics = $n_all ; OUTSIDE tests/unit/s14-ui.test.ts = $n_out (expect 0)"
printf '%s\n' "$tc" | grep -E '^[^ ]*\.tsx?\([0-9]+,[0-9]+\): error TS'
echo "=== G1b apps/ui project typecheck ==="
( cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5; echo "apps/ui tsc exit=${PIPESTATUS[0]}" )
echo "=== G2 t9-mode-tokens named-failure delta ==="
t9=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1); echo "exit=$?"
printf '%s\n' "$t9" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
printf '%s\n' "$t9" | grep -E '^[[:space:]]*FAIL[[:space:]]'
echo "-- colour-literal HIT LIST (the received array's elements) --"
printf '%s\n' "$t9" | grep -E '^\+ +"/.*:[0-9]+:'
echo "hit count = $(printf '%s\n' "$t9" | grep -cE '^\+ +\"/.*:[0-9]+:') (expect 1)"
echo "=== G3 v2ui-node-runner ==="
pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts 2>&1 | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
echo "=== G4 auth-flow-integration ==="
pnpm exec vitest run tests/render/auth-flow-integration.test.tsx 2>&1 | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
echo "=== G5 the five RED-at-base suites, by name ==="
for f in tests/architecture/auth-front-door-parity.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts tests/architecture/role-token-map.test.ts tests/render/t3-library.test.tsx; do
  echo "--- $f ---"
  o=$(pnpm exec vitest run "$f" 2>&1)
  printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+'
  printf '%s\n' "$o" | grep -E '^[[:space:]]*FAIL[[:space:]]' | sed 's/^/   /'
done
