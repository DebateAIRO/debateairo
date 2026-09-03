#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t3/dialectical-engine || exit 1
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T3C2-REV.log"
echo "[launch] $(date '+%F %T') CODE-T3C2-REV (claude) in $(pwd)" | tee "$LOG"
claude -p "You are a FRESH Opus 5 blind review seat, mission ui-overhaul, board ui-overhaul, ticket t_93f9780a, authority_epoch=35 (marker on the ticket). Judge commit fd82d84e in the slice/t3 worktree — the library lists. You are the ONLY seat that can execute cell T3-C2-5, the browser half, including the dot-overlap test that distinguishes a stack from a row. Verify both dump sha256s first; AM16 law forbids writing or altering a dump. Packet (inside your own tree): .hermes/planning/ui-overhaul/packets/CODE-T3C2-REV.md — read it fully first and follow it exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
