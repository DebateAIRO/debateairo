#!/bin/bash
# CODE-REV-S02-C8 r1 — the reviewer's OWN standing-gate runner.
# Lane from argv (COMMON §10.35): ./rev-c8-gates.sh <lane-root> <label>
set -u
LANE="${1:?usage: rev-c8-gates.sh <lane-root> <label>}"
LABEL="${2:-unlabelled}"
cd "$LANE" || exit 2
echo "##### GATES ($LABEL) — $(pwd) — HEAD $(git rev-parse --short HEAD)"

# G1 — root typecheck DELTA against BASELINE (8 diagnostics, all tests/unit/s14-ui.test.ts).
tc=$(pnpm typecheck 2>&1); tt=$?
n_tc=$(printf '%s\n' "$tc" | grep -cE '^[^ ].*\([0-9]+,[0-9]+\): error TS')
outside=$(printf '%s\n' "$tc" | grep -E '^[^ ].*\([0-9]+,[0-9]+\): error TS' | grep -v '^tests/unit/s14-ui.test.ts' )
echo "G1 typecheck exit=$tt diagnostics=$n_tc outside-pin=$(printf '%s' "$outside" | grep -c . )"
[ -n "$outside" ] && printf 'G1 OUTSIDE:\n%s\n' "$outside"
printf '%s\n' "$tc" | grep -E '^[^ ].*\([0-9]+,[0-9]+\): error TS' | sed 's/^/G1 diag: /'

# G2 — t9 colour-literal HIT LIST (count the received array's elements, §10.18), plus names.
t9=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1); t9v=$?
echo "G2 t9 exit=$t9v"
printf '%s\n' "$t9" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+' | sed 's/^/G2 /'
echo "G2 hit-list elements:"
printf '%s\n' "$t9" | grep -E '^\+[[:space:]]+"/.*:[0-9]+:' | sed 's/^/G2   /'
echo "G2 hit-list count: $(printf '%s\n' "$t9" | grep -cE '^\+[[:space:]]+"/.*:[0-9]+:')"
echo "G2 failing test names:"
printf '%s\n' "$t9" | grep -E '^[[:space:]]*(FAIL|×)' | sed 's/^/G2   /' | head -10

# G3 — the three stylesheet-reading suites RED at base: failure NAME sets.
for f in tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts tests/architecture/role-token-map.test.ts; do
  o=$(pnpm exec vitest run "$f" 2>&1)
  echo "G3 $f  $(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)"
  printf '%s\n' "$o" | grep -E '^[[:space:]]*(FAIL|×)' | sed "s|^|G3   $f :: |"
done

# G4 — green standing suites.
for spec in "tests/render/auth-flow-integration.test.tsx" "tests/unit/v2ui-node-runner.test.ts"; do
  o=$(pnpm exec vitest run "$spec" 2>&1)
  echo "G4 $spec  $(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)"
done

echo "##### END GATES ($LABEL)"
