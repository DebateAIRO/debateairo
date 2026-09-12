#!/bin/bash
# serve-int-frontdoor.sh — the product's TLS front door on :3000 -> :3001, so the browser origin is
# https://localhost:3000 (what the API's CSRF gate requires; allowedOrigin = PUBLIC_APP_URL).
# Runs from the MAIN tree so the cert resolves from MAIN/.local/dev-auth/tls. Stop by the PID file.
set -u
MAIN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-int-frontdoor.log
PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-int-frontdoor.pid
cd "$MAIN" || exit 1
nohup node "$MAIN/deploy/dev-auth/tls-front-door.mjs" > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "frontdoor launched pid=$(cat "$PIDF") port=3000 log=$LOG"
