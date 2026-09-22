#!/bin/bash
# CODE-REV-S02-C8-r2 — cluster command, run() transcribed VERBATIM from S02/PLAN.md:1377-1387.
# Lane from argv (COMMON §10.35). Usage: rev-c8-r2-cluster.sh <lane>
set -u
cd "$1" || exit 9
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
run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
