#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t5/dialectical-engine || exit 1
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T5C1-REV.log"
echo "[launch] $(date '+%F %T') CODE-T5C1-REV (claude) in $(pwd)" | tee "$LOG"
claude -p "You are a FRESH Opus 5 blind review seat, mission ui-overhaul, board ui-overhaul, ticket t_ee9e4f48, authority_epoch=34 (marker on the ticket). Judge commit 6b3651e9 in the slice/t5 worktree — the node detail drawer. You are the ONLY seat that can execute cell T5-C1-8, the browser half: serve the worker's DOM dump plus the real globals.css and measure in Chromium in BOTH modes. Verify the dump's sha256 first; AM16 law forbids you from writing or altering a dump — absence or mismatch is a REWORK finding, never something you substitute. Packet (inside your own tree): .hermes/planning/ui-overhaul/packets/CODE-T5C1-REV.md — read it fully first and follow it exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
