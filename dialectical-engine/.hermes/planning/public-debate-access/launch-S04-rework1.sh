#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s04-code/dialectical-engine
SID=01a04fc8-13c4-7442-bd00-53b1872feb77
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/prompt-S04-rework1.txt
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S04-rework1-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing: $WT"; exit 1; }
[ -f "$P" ]  || { echo "FATAL: prompt missing: $P"; exit 1; }
cd "$WT" || exit 1
echo "S04-CODE REWORK 1 · Codex · REV-08 B1/B2/N1/N2"
codex exec -s danger-full-access resume "$SID" "$(cat "$P")" < /dev/null 2>&1 | tee "$LOG"
echo "=== S04-rework1 exited. Log: $LOG ==="
