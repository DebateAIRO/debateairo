#!/bin/bash
# serve-int-ui-3001-supervised.sh — the integration worktree (S01 + S02, f85cbe80) UI on :3001 for V's test window, SUPERVISED.
# Why: the Next dev server OOMs after ~2 h (serve-ui-3001.log 20:14: "JavaScript heap out of memory"
# at a 4 GB heap), and a harness preview server is stopped by the app when the session idles
# (preview 8ba03b4b: "stopped by the app … after 1 h 16 min"). This loop restarts the UI on any exit,
# with a doubled heap, and logs every death. Stop with: kill $(cat serve-ui-3001-supervised.pid) — the
# loop dies, then kill the child in serve-ui-3001.pid. Written fresh 2026-09-10 23:1x.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LOG=$LOGDIR/serve-int-ui-3001.log
PIDF=$LOGDIR/serve-int-ui-3001.pid
SUP=$LOGDIR/serve-int-ui-3001-supervisor.log
cd "$LANE/apps/ui" || exit 1
n=0
while :; do
  n=$((n+1))
  echo "$(date '+%F %T') start #$n" >> "$SUP"
  DIALECTICAL_UI_HOST=127.0.0.1 PORT=3001 DIALECTICAL_API_BASE=http://127.0.0.1:8790 NEXT_PUBLIC_API_BASE=/api \
  NODE_OPTIONS=--max-old-space-size=8192 \
    node server.mjs --dev >> "$LOG" 2>&1 &
  echo $! > "$PIDF"
  wait $!
  rc=$?
  echo "$(date '+%F %T') child exited rc=$rc (start #$n) — restarting in 3 s" >> "$SUP"
  sleep 3
done
