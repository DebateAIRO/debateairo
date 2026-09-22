#!/bin/sh
# ARCH-REV-S02: re-run every S02 cluster command in the lane at base, with the PLAN's own guard.
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine || exit 9
run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  bs=$(printf '%s' "$out" | grep -ciE 'startup error|unexpected argument|failed to load|usage:|command not found|cannot find module')
  nf=$(printf '%s' "$out" | grep -ciE 'no test files found')
  echo "$id | vt=$vt guard=$guard VERDICT=$v | brokenSigs=$bs noTestFiles=$nf"
  echo "$id | Tests    : ${sum:-<none>}"
  echo "$id | TestFiles: ${fil:-<none>}"
  [ -z "$sum" ] && echo "$id | raw     : $(printf '%s' "$out" | grep -iE 'no test files found|cannot find module' | head -1)"
}
run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C4 3 tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
run S02-C6 1 tests/render/consent-policy-modal-behaviour.test.tsx
run S02-C7 2 tests/render/consent-signup-modal.test.tsx tests/render/auth-flow-integration.test.tsx
run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
run S02-C9 9 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx
echo "### lane porcelain after cluster commands: $(git status --porcelain | wc -l | tr -d ' ') entries"
