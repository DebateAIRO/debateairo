#!/bin/bash
# CODE-REV-S02-C1C2 r2 — the PLAN §Clusters `run` idiom, transcribed verbatim from
# docs/missions/consent-ui/slices/S02/PLAN.md:1376-1388. Lane comes from $1 (fixes r1 F6).
cd "${1:?lane required}" || exit 99
echo "### grep flavour: $(grep --version 2>&1 | head -1) · LC_ALL=${LC_ALL:-<unset>}"
run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  printf '%s' "$sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" \
    && ! printf '%s' "$sum" | grep -q 'failed' \
    && printf '%s' "$fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${n} passed \(${n}\)"; guard=$?
  [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]; v=$?
  echo "$id | vt=$vt guard=$guard VERDICT=$v | sum=[$sum] fil=[$fil]"
}
for i in 1 2 3; do
  echo "--- RUN $i ---"
  run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
  run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
done
