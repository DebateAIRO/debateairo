#!/bin/sh
# ARCH-REV-S01 probe 8 — the PLAN's C2, C3 and C4 cluster commands, verbatim from
# PLAN.md §4 rows :555, :556, :557, re-run AT BASE by the reviewer with the PLAN's
# own shared runner (PLAN.md:518-527). C1 was run separately (p3).
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
cd "$LANE" || exit 1
echo "lane HEAD: $(git rev-parse --short HEAD)  dirty before: $(git status --porcelain | wc -l | tr -d ' ')"

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

echo
echo "=== C2 (PLAN.md:555) ==="
run_suites tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0

echo
echo "=== C3 (PLAN.md:556) ==="
run_suites tests/render/tier01-new-plan-tier.test.tsx:20:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0

echo
echo "=== C4 (PLAN.md:557) ==="
run_suites tests/unit/tier01-style-contract.test.ts:1:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2

echo
echo "dirty after: $(git status --porcelain | wc -l | tr -d ' ')"
