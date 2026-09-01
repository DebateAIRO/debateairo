#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C5.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C5.log"
echo "[launch] $(date '+%F %T') CODE-T9C5 codex fresh" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T9C5, a fresh codex coding seat for mission ui-overhaul, board ui-overhaul, ticket t_ea07b5dc, authority_epoch=16, HERMES AUTHORIZED. T9 slice-close bind: audit tests/unit/pda-s03-keyboard-accessibility.test.ts against the shipped T9 surface, re-anchor only what is stale, three-run the row-6 4-file command; zero-diff is legal ONLY with the full audit table. Packet: $PACKET — read it fully and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
