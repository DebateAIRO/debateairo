#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM8-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM8.md
echo "[launch] $(date '+%F %T') ARCH-01-AM8 resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH micro-amendment 8, one small charge: T9-C2-2 predates your AM6 convention — narrow it to the chrome primary CTA and transfer the S2 hero CTA pair to a new T9-C4 cell (the seat's option b). Full charge: $PACKET — read it first, follow exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01-AM8 exited rc=$?" | tee -a "$LOG"
