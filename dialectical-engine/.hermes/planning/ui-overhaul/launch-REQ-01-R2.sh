#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/REQ-01-R2-grok.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/REQ-01-R2.md
echo "[launch] $(date '+%F %T') REQ-01-R2 grok resume" | tee "$LOG"
~/.grok/bin/grok --resume 01a0580a-4087-7623-a45d-ecf41571c41c -p "/goal MICRO-ROUND 2 for REQ-01: land findings N1-N4 exactly as prescribed. Packet: $PACKET — read it first, follow it exactly." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') REQ-01-R2 exited rc=$?" | tee -a "$LOG"
