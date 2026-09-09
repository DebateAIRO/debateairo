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
run_suites tests/unit/tier01-style-contract.test.ts:1:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2
