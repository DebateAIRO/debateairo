#!/bin/zsh
# REQ-01 — Grok requirements seat, ui-overhaul mission (fresh heredoc launcher)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/REQ-01-grok.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/REQ-01.md
echo "[launch] $(date '+%F %T') REQ-01 grok-4.5 starting" | tee "$LOG"
~/.grok/bin/grok -p "/goal You are the REQ-01 requirements seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') REQ-01 grok exited rc=$?" | tee -a "$LOG"
