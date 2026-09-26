#!/bin/zsh
# ARCH-PES-S01 probe p7 — type-checks the PLAN's proposed code blocks (probes/ARCH-PES-S01/proposed/*.ts) with the
# lane's tsc and the lane's compiler options (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
# verbatimModuleSyntax), the three workspace packages mapped to the lane's sources. Writes nothing in the lane.
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
cd $D || exit 3
LOG=$D/p7-typecheck-proposed.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/node_modules/.bin/tsc -p $D/tsconfig.proposed.json
echo "--- diagnostics by file:"; grep -E 'error TS[0-9]+' $D/p7-typecheck-proposed.log | sed -E 's/\([0-9]+,[0-9]+\).*//' | sort | uniq -c
