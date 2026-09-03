#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T1C2-REV.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T1C2-REV.log"
echo "[launch] $(date '+%F %T') CODE-T1C2-REV fresh opus" | tee "$LOG"
claude -p "You are a FRESH Opus 5 blind review seat for mission ui-overhaul, board ui-overhaul, ticket t_ff92db49, authority_epoch=24 (marker on the ticket). Judge commit 8230bc27 — the card-anatomy cluster: double-bezel, stance tabs/attrs, BASE/FINAL/Details, review marks, typed connectors, 30-literal AF-1 re-skin across nine files. Weighted: token-role review of all 30 replacements (choice is mechanically unguarded — your eyes are the gate), attribute-vs-token agreement mutants, the no-re-anchor byte-identity claim on ui02e, Q-11 scope absence. Packet: $PACKET — read it fully first and follow it exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
