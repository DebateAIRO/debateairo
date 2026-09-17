#!/bin/bash
# serve-ui-3001.sh — the S01 lane UI on :3001, the upstream the TLS front door on :3000 expects
# (mirrors apps/runner/src/dev-ui-process.ts). Written fresh 2026-09-10. Stop by the PID file.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-ui-3001.log
PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-ui-3001.pid
cd "$LANE/apps/ui" || exit 1
DIALECTICAL_UI_HOST=127.0.0.1 PORT=3001 DIALECTICAL_API_BASE=http://127.0.0.1:8790 NEXT_PUBLIC_API_BASE=/api \
  nohup node server.mjs --dev > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "ui launched pid=$(cat "$PIDF") port=3001 log=$LOG"
