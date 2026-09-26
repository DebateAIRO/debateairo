#!/bin/zsh
# measure-frame.zsh <lane> <name> <suite:passed:failed> … — the orchestrator's START frame for a DEPENDENT cluster, measured at the
# lane's branch head AFTER its predecessors landed (TOOLING-TRAPS "A cluster's base moves when its predecessor lands"). Writes
# logs/frame-<name>.log whose FIRST line carries the sha, and prints the summary lines gen-build-packet.py quotes. The pairs are the
# cluster's OWN pairs (so the marker is RED = TDD-red at start) — the per-suite passed/failed lines are the measurement.
set -u
export PATH="/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
LANE=${1:?lane}; NAME=${2:?name}; shift 2; [ $# -ge 1 ] || { echo "pairs required" >&2; exit 2; }
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; L=$R/.hermes/reports/provider-env-selection/logs; SK=$R/.claude/skills/heartbeat-orchestrator/scripts
cd "$LANE" || exit 9
OUT=$L/frame-$NAME.log; FULL=$L/frame-$NAME-full.log
{ echo "frame $NAME HEAD=$(git rev-parse --short HEAD) branch=$(git rev-parse --abbrev-ref HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ') measured=$(date '+%F %T') pairs=$*"
  LOG=$FULL zsh $SK/run-suites.sh "$@" 2>&1
  echo "typecheck: $(LOG=$L/frame-$NAME-typecheck.log zsh $SK/run-capture.sh pnpm typecheck 2>&1 | head -1) diagnostics=$(grep -c -E 'error TS[0-9]+' $L/frame-$NAME-typecheck.log)"
  grep -o -E '^[^( ]+\([0-9]+,[0-9]+\): error TS[0-9]+' $L/frame-$NAME-typecheck.log | sort | uniq -c | sort -rn | head -10
} > $OUT 2>&1
cat $OUT
