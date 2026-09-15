#!/bin/sh
# ARCH-REV-S01 probe 3 — the PLAN's C1 cluster command, re-run AT BASE by the reviewer,
# verbatim from PLAN.md §4 (the shared runner at PLAN.md:518-527 and the C1 row at :554).
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
cd "$LANE" || exit 1
echo "lane HEAD: $(git rev-parse --short HEAD)  dirty before: $(git status --porcelain | wc -l | tr -d ' ')"
echo "generated/ checksum before: $(find packages/contract/generated -type f -exec shasum {} \; 2>/dev/null | shasum | cut -d' ' -f1)"
echo

run_suites() { ok=1; for p in "$@"; do f=${p%%:*}; r=${p#*:}; xp=${r%%:*}; xf=${r##*:};
  o=$(pnpm exec vitest run "$f" 2>&1); rc=$?;
  s=$(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1);
  if printf '%s\n' "$o" | grep -q 'No test files found' || [ -z "$s" ]; then
    echo "BROKEN $f (no summary line)"; ok=0; continue; fi
  ap=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0};
  af=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0};
  echo "$f rc=$rc passed=$ap failed=$af (expect $xp/$xf)";
  [ "$ap" = "$xp" ] && [ "$af" = "$xf" ] || ok=0; done;
  [ $ok -eq 1 ] && echo CLUSTER_GREEN || echo CLUSTER_RED; }

echo "=== C1, verbatim ==="
g=$(pnpm run generate:contract 2>&1); grc=$?
echo "generate:contract rc=$grc"
[ $grc -eq 0 ] && run_suites tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 tests/architecture/s8-publication-contract.test.ts:4:1

echo
echo "generated/ checksum after: $(find packages/contract/generated -type f -exec shasum {} \; 2>/dev/null | shasum | cut -d' ' -f1)"
echo "dirty after: $(git status --porcelain | wc -l | tr -d ' ')"
