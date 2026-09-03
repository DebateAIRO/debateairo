#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C2-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C2-REV.md
echo "[launch] $(date '+%F %T') CODE-T9C2-REV claude-opus-5 fresh blind seat starting" | tee "$LOG"
claude -p "You are a fresh blind review seat for mission ui-overhaul: review Wave 2 cluster T9-C2 at frozen commit 6aa9f35 — landing chrome + the safeReturnPath open-redirect surface. Your complete charge is the file $PACKET — read it FIRST and follow it exactly. Attack the return path like an open-redirect hunter (six-plus vectors of your own), reproduce the RED, rebuild the mutants your way. Verdict PASS or REWORK on ticket t_3c187757." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C2-REV exited rc=$?" | tee -a "$LOG"
