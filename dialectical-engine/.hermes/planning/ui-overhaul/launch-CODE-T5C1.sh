#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t5/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T5C1.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T5C1.log"
echo "[launch] $(date '+%F %T') CODE-T5C1 codex fresh in $(pwd)" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' "You are CODE-T5C1, a fresh codex coding seat for mission ui-overhaul, board ui-overhaul, ticket t_84db10ff, authority_epoch=32, HERMES AUTHORIZED (marker on the ticket — read it back before claiming). Row 11 in the slice/t5 worktree: the node detail drawer, its six positional key/value rows, condition pills with distinct marks, and the full review line that belongs to THIS surface. You CREATE tests/render/t5-drawer.test.tsx — quote the collected file count (7) on every run. The browser half is the review seat's — you emit the drawer DOM dump. Packet: $PACKET — read it fully and execute exactly. Your cwd IS your worktree; never touch the main checkout." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
