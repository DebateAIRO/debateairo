#!/bin/bash
# CODE-REV-CROSS-01 r1 — gate deltas, transcribed from the PLAN's fenced blocks.
# Lane from argv (COMMON 10.35: no hard-coded .worktrees/ path).
LANE="${1:?usage: gates.sh <absolute lane path>}"
ROUNDS="${2:-3}"
cd "$LANE" || exit 2
COMMIT=$(git rev-parse --short HEAD)

cmd_c6() {
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
}

cmd_c7() {
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
  toksum=$(printf '%s\n' "$tok" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  [ "$vt" -eq 0 ] \
    && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+6 passed \(6\)' \
    && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] && [ "$n_blocks" -eq 1 ] \
    && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
  echo "S01-C7 verdict=$?   summary:$sum  files:$files   hit-list: $n_hits (pinned: $n_lit)  t9 failures: $n_tokfail  t9 summary:$toksum  S01 css blocks: $n_blocks   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
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
  echo "$id | vt=$vt guard=$guard VERDICT=$v | $sum | $fil"
  return $v
}

run_c9() {
  n="$1"; shift
  run S02-C9 "$n" "$@"; rc=$?
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)
  echo "S02-C9 | mergeArms: --scrim:=$s01 (expect 2)  S02markers=$s02 (expect 2)"
  [ "$rc" -eq 0 ] && [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
  echo "S02-C9 COMBINED verdict=$?"
}

sixteen() {
  run SIXTEEN 16 tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
}

appsui() {
  o=$(cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1); e=$?
  echo "APPSUI tsc exit=$e  errors=$(printf '%s\n' "$o" | grep -cE 'error TS[0-9]+')"
  printf '%s\n' "$o" | grep -E 'error TS[0-9]+' | head -5
}

for i in $(seq 1 "$ROUNDS"); do
  echo "########## RUN $i/$ROUNDS  commit=$COMMIT  shell=$0 ##########"
  echo "--- CMD-C6 ---";   cmd_c6
  echo "--- CMD-C7 ---";   cmd_c7
  echo "--- run_c9 ---";   run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  echo "--- sixteen-file set ---"; sixteen
  echo "--- apps/ui tsc arm ---";  appsui
  echo "--- tree clean? ---"; git status --porcelain | wc -l
done
echo "########## DONE commit=$COMMIT ##########"
