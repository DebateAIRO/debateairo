#!/bin/zsh
# REQ-01 rework round 1 — same grok session resumed (fresh heredoc launcher)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/REQ-01-R1-grok.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/REQ-01-R1.md
echo "[launch] $(date '+%F %T') REQ-01-R1 grok resume 01a0580a-4087-7623-a45d-ecf41571c41c" | tee "$LOG"
~/.grok/bin/grok --resume 01a0580a-4087-7623-a45d-ecf41571c41c -p "/goal REWORK ROUND 1 for your REQ-01 requirements work. Your rework packet is the file $PACKET — read it FIRST and follow it exactly." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') REQ-01-R1 exited rc=$?" | tee -a "$LOG"
