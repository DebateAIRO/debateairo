#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-REV-grok.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-REV.md
echo "[launch] $(date '+%F %T') ARCH-01-REV grok starting" | tee "$LOG"
~/.grok/bin/grok -p "/goal You are the ARCH-01-REV blind review seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with section 0." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01-REV exited rc=$?" | tee -a "$LOG"
