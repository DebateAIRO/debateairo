#!/bin/zsh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8; cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine
for i in 1 2; do
  s=$SECONDS
  node node_modules/vitest/vitest.mjs run tests/integration/dev-deployment-register.test.ts > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/merge-dev/b3-quiet-run$i.log 2>&1
  echo "run$i rc=$? $((SECONDS-s))s $(grep -E '^ +Tests ' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/merge-dev/b3-quiet-run$i.log | tr -s ' ')" >> /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/merge-dev/b3-quiet.txt
done
