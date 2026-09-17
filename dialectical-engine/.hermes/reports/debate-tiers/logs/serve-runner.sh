#!/bin/bash
# serve-runner.sh — the RUNNER stage from the S01 lane (coverage/serve/serve-runner.ts), custody from the
# main tree, SUPERVISED (restart on any exit, each death logged). The stage serve-stack.sh lacks; without
# it no accepted ask is ever executed. Stop: kill $(cat serve-runner-supervised.pid), then the child in
# serve-runner.pid. Written fresh 2026-09-10 23:2x.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
cd "$LANE" || exit 1
supervise() {
  n=0
  while :; do
    n=$((n+1)); echo "$(date '+%F %T') runner start #$n" >> "$LOGDIR/serve-runner-supervisor.log"
    node node_modules/tsx/dist/cli.mjs coverage/serve/serve-runner.ts >> "$LOGDIR/serve-runner.log" 2>&1 &
    echo $! > "$LOGDIR/serve-runner.pid"; wait $!; rc=$?
    echo "$(date '+%F %T') runner exited rc=$rc (start #$n) — restarting in 5 s" >> "$LOGDIR/serve-runner-supervisor.log"; sleep 5
  done
}
nohup bash -c "$(declare -f supervise); LANE='$LANE'; LOGDIR='$LOGDIR'; cd '$LANE'; supervise" > /dev/null 2>&1 &
echo $! > "$LOGDIR/serve-runner-supervised.pid"
echo "runner supervisor pid=$(cat "$LOGDIR/serve-runner-supervised.pid") log=$LOGDIR/serve-runner.log"
