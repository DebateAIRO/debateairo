#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine || exit 9
echo "verify $(date "+%F %T") HEAD=$(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l | tr -d " ")"
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
run_suites tests/render/tier01-new-plan-tier.test.tsx:20:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0
