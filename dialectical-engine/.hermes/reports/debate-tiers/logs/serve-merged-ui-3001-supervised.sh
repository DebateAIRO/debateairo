#!/bin/bash
# serve-merged-ui-3001-supervised.sh — stage 2 of the serve order of record: the UI on :3001 from the MERGED tree .worktrees/all, SUPERVISED.
# Why supervised: the Next dev server OOMs after ~2 h of polling (serve-ui-3001.log 2026-09-10 20:14, 4 GB heap); the loop restarts it
# on any exit with a doubled heap and logs every death. Stop: kill $(cat serve-merged-ui-3001-supervised.pid), then the child in
# serve-merged-ui-3001.pid. Written fresh 2026-09-16.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LOG=$LOGDIR/serve-merged-ui-3001.log
PIDF=$LOGDIR/serve-merged-ui-3001.pid
SUP=$LOGDIR/serve-merged-ui-3001-supervisor.log
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
