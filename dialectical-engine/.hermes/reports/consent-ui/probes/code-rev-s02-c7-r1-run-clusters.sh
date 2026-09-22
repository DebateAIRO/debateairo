#!/bin/bash
# CODE-REV-S02-C7 r1 — my own transcription of the PLAN's run() idiom (PLAN.md:1377-1389).
# LANE COMES FROM argv (COMMON §10.35), never hard-coded.
LANE="${1:?usage: run-clusters.sh <lane-dir-holding-package.json> [repeats]}"
REPEATS="${2:-3}"
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
  echo "$id | commit=$(git rev-parse --short HEAD) | vt=$vt guard=$guard VERDICT=$v | ${sum} | ${fil}"
}

for i in $(seq 1 "$REPEATS"); do
  echo "===== SCRIPT RUN $i ====="
  run S02-C7 5 tests/render/consent-signup-modal.test.tsx tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
done
