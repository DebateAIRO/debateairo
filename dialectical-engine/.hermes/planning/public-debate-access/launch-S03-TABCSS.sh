#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s03-code/dialectical-engine
SID=01a04d0e-6ff3-7792-a1c9-d7a3afc1cc2a
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/prompt-S03-TABCSS.txt
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S03-TABCSS-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
[ -f "$P" ]  || { echo "FATAL: prompt missing"; exit 1; }
cd "$WT" || exit 1
echo "S03-TABCSS · Codex · t_880241fd · the active tab has no visual state"
codex exec -s danger-full-access resume "$SID" "$(cat "$P")" < /dev/null 2>&1 | tee "$LOG"
echo "=== S03-TABCSS exited. Log: $LOG ==="
