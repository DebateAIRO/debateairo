#!/bin/bash
# CODE-REV-S02-C1C2 r1 — the PLAN §Clusters `run` idiom, transcribed verbatim from
# docs/missions/consent-ui/slices/S02/PLAN.md:1376-1388. Executed by the REVIEWER.
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c1c2/dialectical-engine || exit 99
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

# --- RE-RUN INSTRUCTIONS for this whole kit (appended by CODE-REV-S02-C1C2, r1) ---
# From a worktree at the commit under review, holding package.json:
#   cp code-rev-s02-c1c2-r1-*.probe.tsx code-rev-s02-c1c2-r1-probe.vitest.config.ts .review-scratch/
#   (rename them back to esc-stack.probe.tsx / nesting.probe.tsx / remount.probe.tsx /
#    probe.vitest.config.ts — the config's `include` globs `.review-scratch/**/*.probe.tsx`)
#   pnpm exec vitest run --config .review-scratch/probe.vitest.config.ts
# Expected AGAINST HEAD 91877847: Tests 2 failed | 27 passed (29)
#   failing: "P1 NESTED same-commit ..."  and  "R2 what the VISITOR sees when the stack is inverted"
# Expected AGAINST A FIXED MODULE:      Tests 29 passed (29)
# Mutation harness:  /bin/bash code-rev-s02-c1c2-r1-mutants.sh
# Copy diff:         node       code-rev-s02-c1c2-r1-copy-diff.mjs      (exit 0 = 0 mismatches)
# Exported surface:  python3    code-rev-s02-c1c2-r1-surface-check.py
