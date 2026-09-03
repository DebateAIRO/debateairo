#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t1/dialectical-engine || exit 1
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T1C3.log"
echo "[launch] $(date '+%F %T') CODE-T1C3 (codex) in $(pwd)" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T1C3, a FRESH codex coding seat, mission ui-overhaul, board ui-overhaul, ticket t_2b19a84b, authority_epoch=31, HERMES AUTHORIZED and the card is now ASSIGNED to you (read both back before claiming). A prior seat blocked correctly because the packet was outside its sandbox; it now lives inside your own worktree. Row 9 in slice/t1: set-aside, synthesis rail fidelity, public lock via onChallengeNode===undefined. Browser half belongs to the review seat — you emit DOM dumps. Packet (inside your own tree): .hermes/planning/ui-overhaul/packets/CODE-T1C3.md — read it fully and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
