#!/bin/bash
# CODE-REV-S02-C3C4 r1 — the two owned cluster commands, run by the reviewer.
# Guard transcribed from PLAN.md:1377-1389 (the run() idiom). ASCII terms only (COMMON §10.16).
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine || exit 99
echo "grep flavour in this shell: $(grep --version 2>&1 | head -1)"
echo "LC_ALL=[${LC_ALL}] LANG=[${LANG}]"
echo "HEAD: $(git rev-parse --short HEAD)  porcelain: $(git status --porcelain | wc -l)"

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  echo "$id | vt=$vt guard=$guard VERDICT=$v"
  echo "$id | Tests    : $sum"
  echo "$id | TestFiles: $fil"
  # named-failure visibility (ASCII anchor, never the glyph)
  echo "$id | FAILlines: $(printf '%s' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]')"
  return $v
}

for i in 1 2 3; do
  echo "===== RUN $i ====="
  run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  echo "S02-C3 run$i exit=$?"
  run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
  echo "S02-C4 run$i exit=$?"
done
echo "===== DONE ====="
echo "porcelain at end: $(git status --porcelain | wc -l)"
