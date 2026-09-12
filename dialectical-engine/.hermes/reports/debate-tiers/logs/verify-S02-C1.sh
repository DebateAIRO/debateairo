#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine || exit 9
echo "verify $(date '+%F %T') HEAD=$(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ')"
o=$(pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts 2>&1); rc=$?
printf '%s\n' "$o" | /usr/bin/grep -E '^[[:space:]]*(Test Files|Tests)[[:space:]]' | tail -2
echo "rc=$rc"
