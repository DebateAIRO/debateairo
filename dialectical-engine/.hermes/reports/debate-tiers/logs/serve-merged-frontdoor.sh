#!/bin/bash
# serve-merged-frontdoor.sh — stage 3 of the serve order of record: the product's TLS front door on :3000 -> :3001, so the browser origin is
# https://localhost:3000 (what the API's CSRF gate requires; allowedOrigin = PUBLIC_APP_URL). Runs from the MERGED tree .worktrees/all;
# the certificate resolves through the .local symlink to MAIN/.local/dev-auth/tls (deploy/dev-auth/tls-front-door.mjs is byte-identical
# in both trees, measured 2026-09-16). Stop by the PID file. Written fresh 2026-09-16.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-merged-frontdoor.log
PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-merged-frontdoor.pid
cd "$LANE" || exit 1
nohup node "$LANE/deploy/dev-auth/tls-front-door.mjs" > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "frontdoor launched pid=$(cat "$PIDF") port=3000 log=$LOG"
