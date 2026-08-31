#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C3-codex.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C3.md
echo "[launch] $(date '+%F %T') CODE-T9C3 codex gpt-5.6-sol starting" | tee "$LOG"
codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' "You are the T9-C3 Wave-0 coding seat for the ui-overhaul mission. Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order. TDD: RED before GREEN, evidence in the handoff." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C3 exited rc=$?" | tee -a "$LOG"
