#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
P=$REPO/.hermes/planning/public-debate-access/prompt-ARCH-split.txt
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-split-claude.log
[ -f "$P" ] || { echo "FATAL: prompt missing: $P"; exit 1; }
cd "$REPO" || exit 1
echo "ARCH-01 SCHEMA SPLIT DESIGN · ticket t_83df0d9c · V ruled fix-it-now"
claude --resume "$SID" -p "$(cat "$P")" --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-split exited. Log: $LOG ==="
