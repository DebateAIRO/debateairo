#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C2-codex.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C2.md
echo "[launch] $(date '+%F %T') CODE-T9C2 codex gpt-5.6-sol fresh session starting" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are the T9-C2 Wave-2 coding seat for the ui-overhaul mission (ticket t_3c187757, authority_epoch=10, HERMES AUTHORIZED). Your complete goal packet is the file $PACKET — read it FIRST and follow it exactly, starting with its section 0 read order. TDD: RED before GREEN. Post your CLAIM comment before coding." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C2 exited rc=$?" | tee -a "$LOG"
