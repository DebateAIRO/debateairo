#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C5-REV.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C5-REV.log"
echo "[launch] $(date '+%F %T') CODE-T9C5-REV fresh opus" | tee "$LOG"
claude -p "You are a FRESH Opus 5 blind review seat for mission ui-overhaul, board ui-overhaul, ticket t_ea07b5dc, authority_epoch=20 (marker on the ticket). The T9 slice-close worker returned ZERO-DIFF: its audit found every pda-s03 case honestly measures the shipped T9 surface, and it proved suite liveness with a route-split probe. Decide whether the zero-diff was EARNED: build your OWN per-case audit table BEFORE reading the worker's in detail, run a DIFFERENT liveness probe, re-measure the pin-list completeness, three-run the 4-file bind. Packet: $PACKET — read it fully first and follow it exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
