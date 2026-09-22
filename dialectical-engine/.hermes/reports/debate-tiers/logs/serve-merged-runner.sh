#!/bin/bash
# serve-merged-runner.sh — stage 1b of the serve order of record: the RUNNER (claims accepted asks) from the MERGED tree .worktrees/all
# (coverage/serve/serve-runner.ts), custody via the .local symlink, SUPERVISED (restart on any exit, each death logged).
# Stop: kill $(cat serve-merged-runner-supervised.pid), then the child in serve-merged-runner.pid. Written fresh 2026-09-16.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
cd "$LANE" || exit 1
supervise() {
  n=0
  while :; do
    n=$((n+1)); echo "$(date '+%F %T') runner start #$n" >> "$LOGDIR/serve-merged-runner-supervisor.log"
    node node_modules/tsx/dist/cli.mjs coverage/serve/serve-runner.ts >> "$LOGDIR/serve-merged-runner.log" 2>&1 &
    echo $! > "$LOGDIR/serve-merged-runner.pid"; wait $!; rc=$?
    echo "$(date '+%F %T') runner exited rc=$rc (start #$n) — restarting in 5 s" >> "$LOGDIR/serve-merged-runner-supervisor.log"; sleep 5
  done
}
nohup bash -c "$(declare -f supervise); LANE='$LANE'; LOGDIR='$LOGDIR'; cd '$LANE'; supervise" > /dev/null 2>&1 &
echo $! > "$LOGDIR/serve-merged-runner-supervised.pid"
echo "runner supervisor pid=$(cat "$LOGDIR/serve-merged-runner-supervised.pid") log=$LOGDIR/serve-merged-runner.log"
