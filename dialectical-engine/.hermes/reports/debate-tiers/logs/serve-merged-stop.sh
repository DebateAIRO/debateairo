#!/bin/bash
# serve-merged-stop.sh — stops every stage serve-merged.sh started, by PID file (never pkill -f), supervisors first so nothing restarts.
set -u
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
stop() { p=$(cat "$LOGDIR/$1.pid" 2>/dev/null); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && { kill "$p" 2>/dev/null; echo "$(date '+%H:%M:%S') stopped $1 pid=$p"; } || echo "$(date '+%H:%M:%S') $1: not running"; }
stop serve-merged-frontdoor
stop serve-merged-ui-3001-supervised; stop serve-merged-ui-3001
stop serve-merged-runner-supervised; stop serve-merged-runner
stop serve-merged-stack
sleep 3
for port in 3000 3001 8790 8791 8792 8793 8794 8795 8796; do lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1 && echo "still listening on :$port — $(lsof -nP -iTCP:$port -sTCP:LISTEN | awk 'NR==2{print $1, $2}')" || true; done
echo "done"
