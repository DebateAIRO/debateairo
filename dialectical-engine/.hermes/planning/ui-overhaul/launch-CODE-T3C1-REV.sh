#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T3C1-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T3C1-REV.md
echo "[launch] $(date '+%F %T') CODE-T3C1-REV claude-opus-5 fresh blind seat starting" | tee "$LOG"
claude -p "You are a fresh blind review seat for mission ui-overhaul: review Wave 1 cluster T3-C1 at frozen commit af50e34 (library chrome + TopBar mode mount + anonymous chrome suppression). Your complete charge is the file $PACKET — read it FIRST and follow it exactly. Probe: reproduce the RED, rebuild the strongest mutants your way, add two of your own including one against the suppression mechanism's edges. Verdict PASS or REWORK on ticket t_9d3f1f2d." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T3C1-REV exited rc=$?" | tee -a "$LOG"
