#!/bin/bash
# serve-int-stack.sh — starts the S01 serve stack: CLI provider panel + api.env refresh + the API,
# from the integration worktree (S01 + S02, f85cbe80) against the MAIN custody root. Written fresh 2026-09-10. Stop by the PID file.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/integration-debate-tiers/dialectical-engine
RUNNER=$LANE/coverage/serve/serve-stack.ts
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-int-stack.log
PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-int-stack.pid
[ -f "$RUNNER" ] || { echo "runner missing: $RUNNER"; exit 1; }
cd "$LANE" || exit 1
nohup node "$LANE/node_modules/tsx/dist/cli.mjs" "$RUNNER" > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "stack launched pid=$(cat "$PIDF") log=$LOG"
