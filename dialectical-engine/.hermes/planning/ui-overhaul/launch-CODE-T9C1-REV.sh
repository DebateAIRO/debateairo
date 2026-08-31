#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C1-REV-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C1-REV.md
echo "[launch] $(date '+%F %T') CODE-T9C1-REV claude-opus-5 fresh blind seat starting" | tee "$LOG"
claude -p "You are a fresh blind review seat for mission ui-overhaul: review Wave 1 cluster T9-C1 at frozen commit 3aefb2d (route split + landing skeleton + anon mode control + pda-s03 pin migration). Your complete charge is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order. Probe, do not re-read: reproduce the RED, rebuild the strongest mutants your way, add two of your own (one structural, one against the migration), run every gate. Verdict PASS or REWORK on ticket t_4487f9b1." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C1-REV exited rc=$?" | tee -a "$LOG"
