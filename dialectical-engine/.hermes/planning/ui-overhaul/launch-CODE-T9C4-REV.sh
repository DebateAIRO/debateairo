#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C4-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C4-REV.md
echo "[launch] $(date '+%F %T') CODE-T9C4-REV claude-opus-5 fresh blind seat starting" | tee "$LOG"
claude -p "You are a fresh blind review seat for mission ui-overhaul: review Wave 2 cluster T9-C4 at frozen commit 174735a — the landing content fills, a copy-fidelity cluster where the binding strings are law. Your complete charge is the file $PACKET — read it FIRST and follow it exactly, including its Supersessions block (a parallel addendum lane is live in four named files that are NOT your target). Verdict PASS or REWORK on ticket t_b7c114a3." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C4-REV exited rc=$?" | tee -a "$LOG"
