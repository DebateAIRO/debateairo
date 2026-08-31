#!/bin/zsh
# REQ-01-REV — Claude Opus 5 blind review seat (fresh heredoc launcher)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/REQ-01-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/REQ-01-REV.md
echo "[launch] $(date '+%F %T') REQ-01-REV claude-opus-5 starting" | tee "$LOG"
claude -p "You are the REQ-01-REV blind review seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order." --model claude-opus-5 --permission-mode acceptEdits 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') REQ-01-REV exited rc=$?" | tee -a "$LOG"
