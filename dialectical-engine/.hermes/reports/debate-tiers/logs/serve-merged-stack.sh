#!/bin/bash
# serve-merged-stack.sh — stage 1 of the serve order of record (RESUME-HERE §9): CLI provider panel + api.env refresh + API :8790,
# from the MERGED tree .worktrees/all (branch integration/all = S03 + FIX-S03-p2-F1 + every local branch, 2026-09-16), custody via
# .worktrees/all/dialectical-engine/.local -> MAIN/.local (a symlink; the custody checks lstat the paths BELOW it, which are real).
# Written fresh 2026-09-16 for V's "launch the app stack with the new ui modifications". Stop by the PID file.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
RUNNER=$LANE/coverage/serve/serve-stack.ts
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LOG=$LOGDIR/serve-merged-stack.log
PIDF=$LOGDIR/serve-merged-stack.pid
[ -f "$RUNNER" ] || { echo "runner missing: $RUNNER"; exit 1; }
[ -d "$LANE/.local/dev-auth" ] || { echo "custody missing: $LANE/.local/dev-auth"; exit 1; }
cd "$LANE" || exit 1
nohup node "$LANE/node_modules/tsx/dist/cli.mjs" "$RUNNER" > "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "stack launched pid=$(cat "$PIDF") log=$LOG"
