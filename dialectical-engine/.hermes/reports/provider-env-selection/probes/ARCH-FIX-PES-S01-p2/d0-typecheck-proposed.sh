#!/bin/zsh
# ARCH-FIX-PES-S01-p2 probe d0 — type-checks the Revision-2 reference code (proposed/*.ts) with the lane's tsc and
# compiler options; @debateai/* mapped to the lane's sources (lane HEAD 5b12b2e15 carries the built C1 reader).
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
cd $D || exit 3
LOG=$D/d0-typecheck-proposed.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh \
  /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/node_modules/.bin/tsc -p $D/tsconfig.proposed.json --listFiles
echo "--- diagnostics by file:"; grep -E 'error TS[0-9]+' $D/d0-typecheck-proposed.log | sed -E 's/\([0-9]+,[0-9]+\).*//' | sort | uniq -c
echo "--- proposed files compiled:"; grep -c 'ARCH-FIX-PES-S01-p2/proposed/' $D/d0-typecheck-proposed.log
