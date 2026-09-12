#!/bin/bash
# serve-api.sh — launches the S01-lane API on :8790 for V's TEST(S01). Written fresh 2026-09-10 14:2x EEST.
# The runner reads custody from the MAIN tree and code from the S01 lane (coverage/serve/serve-api.ts).
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
RUNNER=$LANE/coverage/serve/serve-api.ts
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-api.log
PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-api.pid
[ -f "$RUNNER" ] || { echo "runner missing: $RUNNER"; exit 1; }
cd "$LANE" || exit 1
nohup node "$LANE/node_modules/tsx/dist/cli.mjs" "$RUNNER" > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "launched pid=$(cat "$PIDF") log=$LOG"
