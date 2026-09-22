#!/bin/bash
# CODE-REV-S02-C5C6 r1 — independent transcription of PLAN.md:1376-1388's `run()` idiom.
# Lane comes from $1 or $LANE (COMMON §10.35: never a hard-coded lane path).
set -u
LANE="${1:-${LANE:?set LANE or pass the lane as argv[1]}}"
cd "$LANE" || exit 97

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  echo "$id | vt=$vt guard=$guard VERDICT=$v | ${sum:-<none>} | ${fil:-<none>} | commit $(git rev-parse --short HEAD)"
}

case "${2:-all}" in
  C1) run S02-C1 1 tests/render/consent-modal-semantics.test.tsx ;;
  C5) run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx ;;
  C6) run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx ;;
  GOOD) run SANITY-GOOD 1 tests/render/consent-policy-modal-render.test.tsx ;;
  MISSING) run SANITY-MISSING 2 tests/render/consent-policy-modal-render.test.tsx tests/render/zz-does-not-exist.test.tsx ;;
  all)
    run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
    run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
    run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx
    ;;
esac
