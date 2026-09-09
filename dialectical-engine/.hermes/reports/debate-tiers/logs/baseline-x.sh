#!/bin/zsh
# REQ-FIX p2 new findings (a)/(c): baselines for t9-mode-tokens and prov01-honesty-drawer — both lanes at 7f89f7b7
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
for lane in tiers-s01 tiers-s02; do
  cwd=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/$lane/dialectical-engine
  out=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/baseline-x-$lane.log
  : > "$out"
  echo "lane=$lane HEAD=$(git -C $cwd rev-parse --short HEAD) dirty=$(git -C $cwd status --porcelain | wc -l | tr -d ' ') started=$(date '+%F %T')" >> "$out"
  for suite in tests/unit/t9-mode-tokens.test.ts tests/render/prov01-honesty-drawer.test.tsx; do
    echo "=== $suite ===" >> "$out"
    ( cd "$cwd" && perl -e 'alarm 300; exec @ARGV' pnpm exec vitest run "$suite" >> "$out" 2>&1 ); echo "rc=$?" >> "$out"
  done
  echo "dirty_after=$(git -C $cwd status --porcelain | wc -l | tr -d ' ') finished=$(date '+%F %T')" >> "$out"
done
echo DONE > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/baseline-x.done
