#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
P=$REPO/.hermes/planning/public-debate-access/prompt-ARCH-S05.txt
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-S05-claude.log
[ -f "$P" ] || { echo "FATAL: prompt missing"; exit 1; }
cd "$REPO" || exit 1
echo "ARCH-01 S05 DESIGN · V scope correction · ticket t_e8c6c083"
claude --resume "$SID" -p "$(cat "$P")" --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-S05 exited. Log: $LOG ==="
