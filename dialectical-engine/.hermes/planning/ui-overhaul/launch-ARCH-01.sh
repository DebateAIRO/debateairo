#!/bin/zsh
# ARCH-01 — Claude Opus 5 architecture seat (bypassPermissions per F1 class fix)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01.md
echo "[launch] $(date '+%F %T') ARCH-01 claude-opus-5 starting" | tee "$LOG"
claude -p "You are the ARCH-01 architecture seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order. Prove board access early by running the claim comment command your packet names." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01 exited rc=$?" | tee -a "$LOG"
