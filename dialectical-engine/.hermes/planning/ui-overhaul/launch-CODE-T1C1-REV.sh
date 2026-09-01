#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T1C1-REV.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T1C1-REV.log"
echo "[launch] $(date '+%F %T') CODE-T1C1-REV fresh opus" | tee "$LOG"
claude -p "You are a FRESH Opus 5 blind review seat for mission ui-overhaul, board ui-overhaul, ticket t_dd2f3ce0, authority_epoch=22 (marker on the ticket). Judge commit 25155f3a — the T1 wave opener: mode-toggle mount (sibling of hasTree), view-toggle pins, AF-1 re-skin of 12 oklch literals. Weighted charges: token-role semantics the oracle cannot see, SPEC's gold-reserved-for-reasoning line vs the worker's pressure mapping, and whether the no-tree mount case has real force. Packet: $PACKET — read it fully first and follow it exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
