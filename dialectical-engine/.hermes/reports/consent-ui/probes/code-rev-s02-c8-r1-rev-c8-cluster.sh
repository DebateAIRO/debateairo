#!/bin/bash
# CODE-REV-S02-C8 r1 — the reviewer's OWN cluster runner.
# `run()` transcribed verbatim from docs/missions/consent-ui/slices/S02/PLAN.md:1377-1387.
# Lane from argv (COMMON §10.35): ./rev-c8-cluster.sh <lane-root> [runs]
set -u
LANE="${1:?usage: rev-c8-cluster.sh <lane-root> [runs]}"
RUNS="${2:-3}"
cd "$LANE" || exit 2
echo "### lane: $(pwd)"
echo "### HEAD: $(git rev-parse --short HEAD)"

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
  echo "$id | Tests    : ${sum:-<none>}"
  echo "$id | TestFiles: ${fil:-<none>}"
  if [ -z "$sum" ]; then
    echo "$id | raw      : $(printf '%s' "$out" | grep -Ei 'no test files found|cannot find module|failed to resolve import|unexpected argument|command not found' | head -3)"
  fi
}

for i in $(seq 1 "$RUNS"); do
  echo "--- run $i (commit $(git rev-parse --short HEAD)) ---"
  run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
done

echo "### lane porcelain: $(git status --porcelain | wc -l | tr -d ' ') entries"
