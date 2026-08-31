#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C3-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C3-REV.md
echo "[launch] $(date '+%F %T') CODE-T9C3-REV claude-opus-5 starting" | tee "$LOG"
claude -p "You are the CODE-T9C3-REV blind review seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with section 0." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C3-REV exited rc=$?" | tee -a "$LOG"
