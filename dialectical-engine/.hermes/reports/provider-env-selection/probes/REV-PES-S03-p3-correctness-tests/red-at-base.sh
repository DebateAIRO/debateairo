#!/bin/zsh
# REV-PES-S03-p3-correctness-tests — the four intake-RED suites at their intake pairs (00-intake §5b,
# logs/baselines.tsv rows 12/13/15/18). Root: $WORKTREE or argv[1]. Written against 9f29022f3 (copied from REV-PES-S03-p2-correctness-tests, unchanged otherwise).
# Binds no NO-TOUCH port (embedded postgres in t16 takes listen(0)).
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${WORKTREE:-${1:?usage: red-at-base.sh <root>}}"; cd "$WT"; OUT="${0:A:h}"
echo "start $(date '+%F %T %Z') HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
LOG="$OUT/red-at-base.log" zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/integration/dev-api-environment.test.ts:9:1 \
  tests/integration/dev-api-process.test.ts:5:5 \
  tests/integration/dev-provider-panel.test.ts:3:1 \
  tests/integration/t16-algorithm-register.test.ts:20:1
echo "end $(date '+%F %T %Z') dirty $(git status --porcelain | wc -l | tr -d ' ')"
