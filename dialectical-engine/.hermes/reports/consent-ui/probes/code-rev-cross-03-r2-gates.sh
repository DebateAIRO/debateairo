#!/bin/bash
# CODE-REV-CROSS-03 r2 — gates as DELTAS. Run under /bin/bash (COMMON §10.16).
# Lane from argv (COMMON §10.35: never a hard-coded .worktrees/ path).
LANE="${1:?usage: gates.sh <absolute lane path>}"
cd "$LANE" || exit 1
echo "### lane=$LANE  HEAD=$(git rev-parse --short HEAD)  dirty=$(git status --porcelain | wc -l | tr -d ' ')"
echo "### grep: $(grep --version 2>&1 | head -1)"

# ---------------------------------------------------------------- CMD-C6 (S01/PLAN.md:791-810, verbatim)
out=$(pnpm exec vitest run tests/render/consent-policy-link.test.tsx 2>&1); vt=$?
tc=$(pnpm typecheck 2>&1); tt=$?
s02tip=$(git rev-parse --verify -q slice/consent-s02); st=$?
s02c=$(git log --oneline "$s02tip"..HEAD -- apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
n_s02c=$(printf '%s\n' "$s02c" | grep -cE '^[0-9a-f]{7,}')
s02=$(git diff --stat HEAD -- apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+1 passed \(1\)' \
  && [ "$st" -eq 0 ] && [ "$n_s02c" -eq 0 ] \
  && [ -z "$s02" ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C6 verdict=$?   summary:$sum  files:$files   S02-files: ref resolved $st, commits in ${s02tip:-UNRESOLVED}..HEAD touching them: $n_s02c, working-tree diff: '${s02:-none}'   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"

# ---------------------------------------------------------------- CMD-C7 (S01/PLAN.md:814-833, verbatim)
out=$(pnpm exec vitest run tests/render/consent-storage.test.tsx tests/render/consent-bar.test.tsx tests/render/consent-card.test.tsx tests/render/consent-mount.test.tsx tests/render/consent-policy-link.test.tsx tests/render/consent-guards.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_blocks=$(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+6 passed \(6\)' \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] && [ "$n_blocks" -eq 1 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C7 verdict=$?   summary:$sum  files:$files   hit-list: $n_hits (pinned: $n_lit)  t9 failures: $n_tokfail  S01 css blocks: $n_blocks   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"

# ---------------------------------------------------------------- t9 delta, printed by NAME (BASELINE §Addendum 05:10)
printf '%s\n' "$tok" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
printf '%s\n' "$tok" | grep -E '^[[:space:]]*FAIL[[:space:]]'
printf '%s\n' "$tok" | grep -E '^\+   "/.*:[0-9]+:' | sed 's/^/    HIT /'

# ---------------------------------------------------------------- run() / run_c9 (S02/PLAN.md:1377-1387, 1410-1417, verbatim)
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
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)          # S01's two token blocks
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)   # S02's open + end markers
  echo "S02-C9 | mergeArms: --scrim:=$s01 (expect 2)  S02markers=$s02 (expect 2)"
  [ "$rc" -eq 0 ] && [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
}
run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
echo "run_c9 VERDICT=$?"

# ---------------------------------------------------------------- the consent SET (BASELINE.md §Addendum 05:10, verbatim command)
setout=$(npx vitest run tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts 2>&1); sr=$?
echo "SET exit=$sr"
printf '%s\n' "$setout" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
printf '%s\n' "$setout" | grep -E '^[[:space:]]*FAIL[[:space:]]'

# ---------------------------------------------------------------- the pair under review + the three source-text guard suites
run PAIR 2 tests/render/consent-modal-semantics.test.tsx tests/render/consent-cross-slice.test.tsx
run GUARDS 3 tests/render/consent-card.test.tsx tests/render/consent-policy-link.test.tsx tests/render/consent-guards.test.tsx

# ---------------------------------------------------------------- the apps/ui project arm (COMMON §10.30)
uiout=$(cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1); ur=$?
echo "apps/ui tsc exit=$ur  diagnostics=$(printf '%s\n' "$uiout" | grep -cE 'error TS[0-9]+')"
printf '%s\n' "$uiout" | grep -E 'error TS[0-9]+' | head -5

echo "### final dirty=$(git status --porcelain | wc -l | tr -d ' ')"
