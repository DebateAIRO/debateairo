#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s01-strict/dialectical-engine
SID=01a04fbe-04f4-7b30-876e-a0270f80ce98
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/prompt-S01-SPLIT-r2.txt
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S01-SPLIT-r2-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
[ -f "$P" ]  || { echo "FATAL: prompt missing"; exit 1; }
cd "$WT" || exit 1
echo "S01-SPLIT · Codex · t_83df0d9c · implement S01-C1-7 (resumed after Router-caused blocker)"
codex exec -s danger-full-access resume "$SID" "$(cat "$P")" < /dev/null 2>&1 | tee "$LOG"
echo "=== S01-SPLIT-r2 exited. Log: $LOG ==="
