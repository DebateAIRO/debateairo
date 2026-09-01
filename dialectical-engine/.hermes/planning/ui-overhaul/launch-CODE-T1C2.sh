#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T1C2.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T1C2.log"
echo "[launch] $(date '+%F %T') CODE-T1C2 codex fresh" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T1C2, a fresh codex coding seat for mission ui-overhaul, board ui-overhaul, ticket t_ff92db49, authority_epoch=23, HERMES AUTHORIZED (marker on the ticket — read it back before claiming). Row 8, the T1 wave's largest cluster: double-bezel card anatomy with data-stance attrs, BASE/FINAL/Details, owner Regenerate, stance-typed connectors, AF-1 re-skin of 30 literals across nine files. The reasoning color is NOT gold in Terracotta — the packet quotes the trap. Packet: $PACKET — read it fully and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
