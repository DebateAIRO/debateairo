#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-AM-REV-grok.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-AM-REV.md
echo "[launch] $(date '+%F %T') ARCH-AM-REV grok-4.5 fresh session starting" | tee "$LOG"
~/.grok/bin/grok -p "/goal You are the elected ARCH review seat for mission ui-overhaul, reviewing amendment series AM2-AM5 at frozen commit 071e2ea (AM5 rewrote all 32 dispatch rows — probe its sweep, do not read-and-nod). Your complete packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order. A parallel coding seat is live on the working tree: execute only in /tmp scratch copies." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-AM-REV exited rc=$?" | tee -a "$LOG"
