#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T1C1.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T1C1.log"
echo "[launch] $(date '+%F %T') CODE-T1C1 codex fresh" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T1C1, a fresh codex coding seat for mission ui-overhaul, board ui-overhaul, ticket t_dd2f3ce0, authority_epoch=21, HERMES AUTHORIZED (marker on the ticket — read it back before claiming). T1 wave opener: debate chrome, view toggles, mode-toggle mount as SIBLING of the hasTree conditional, AF-1 re-skin of 12 oklch literals to tokens, ADR-006 baseline-transition clause for the PDA-owned TS2322. Packet: $PACKET — read it fully and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
