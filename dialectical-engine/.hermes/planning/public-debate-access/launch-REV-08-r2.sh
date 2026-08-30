#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-08/dialectical-engine
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/prompt-REV-08-r2.txt
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/REV-08-r2-grok.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
[ -f "$P" ]  || { echo "FATAL: prompt missing"; exit 1; }
cd "$WT" || exit 1
echo "REV-08 RE-REVIEW · Grok · same session (--continue) · ticket t_fec6b69a"
~/.grok/bin/grok --continue -p "$(cat "$P")" -m grok-4.5 --permission-mode bypassPermissions < /dev/null 2>&1 | tee "$LOG"
echo "=== REV-08-r2 exited. Log: $LOG ==="
