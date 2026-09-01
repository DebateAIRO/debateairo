#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C2-N1-codex.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C2-N1.md
echo "[launch] $(date '+%F %T') CODE-T9C2-N1 codex resume 01a05a3c" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' 01a05a3c-42d1-7772-a3a6-ddae54b9447f "T9-C2 PASSED. One tiny addendum (ticket t_091db288, authority_epoch=12, HERMES AUTHORIZED): two regression rows the reviewer named, reproduce-first on its M8/M9 mutants. Packet: $PACKET — read and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C2-N1 exited rc=$?" | tee -a "$LOG"
