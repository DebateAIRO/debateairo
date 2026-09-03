#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t3/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T3C2.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T3C2.log"
echo "[launch] $(date '+%F %T') CODE-T3C2 codex fresh in $(pwd)" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T3C2, a fresh codex coding seat for mission ui-overhaul, board ui-overhaul, ticket t_1d7f74a9, authority_epoch=33, HERMES AUTHORIZED (marker on the ticket — read it back before claiming). Row 14 in the slice/t3 worktree: library selectors recased, the count derived from the rendered rows, the search-indexing disclosure ONCE under the public list instead of per row, plus the routed pda-s03 recase migration and its dangling-comment one-liner. The browser half is the review seat's — you emit both tab DOM dumps. Packet: $PACKET — read it fully and execute exactly. Your cwd IS your worktree; never touch the main checkout." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
