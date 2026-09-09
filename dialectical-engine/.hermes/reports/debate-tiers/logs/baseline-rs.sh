#!/bin/zsh
# ARCH(S01) F4: the 17 suites that READ an S01 write surface — both lanes at 7f89f7b7
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
for lane in tiers-s01 tiers-s02; do
  cwd=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/$lane/dialectical-engine
  out=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/baseline-rs-$lane.log
  : > "$out"
  echo "lane=$lane HEAD=$(git -C $cwd rev-parse --short HEAD) dirty=$(git -C $cwd status --porcelain | wc -l | tr -d ' ') started=$(date '+%F %T')" >> "$out"
  for suite in tests/render/bug02-debate-effects.test.tsx tests/render/evaluator-dev-menu-controls.test.tsx tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/v2ui-ownership.test.ts tests/architecture/s7-authorization-contract.test.ts tests/architecture/s8-publication-contract.test.ts tests/architecture/role-token-map.test.ts tests/render/consent-bar.test.tsx tests/render/consent-card.test.tsx tests/render/consent-cross-slice.test.tsx tests/render/consent-guards.test.tsx tests/render/consent-policy-link.test.tsx tests/render/t3-library.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts ; do
    echo "=== $suite ===" >> "$out"
    ( cd "$cwd" && [ -f "$suite" ] && perl -e 'alarm 300; exec @ARGV' pnpm exec vitest run "$suite" >> "$out" 2>&1 || echo "MISSING-OR-FAILED" >> "$out" ); echo "rc=$?" >> "$out"
  done
  echo "dirty_after=$(git -C $cwd status --porcelain | wc -l | tr -d ' ') finished=$(date '+%F %T')" >> "$out"
done
echo DONE > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/baseline-rs.done
