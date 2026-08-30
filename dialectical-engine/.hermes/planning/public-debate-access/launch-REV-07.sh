#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-07/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/REV-07.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/REV-07-grok.log
[ -f "$PACKET" ] || { echo "FATAL: packet missing at $PACKET"; exit 1; }
[ -d "$WT" ]     || { echo "FATAL: worktree missing at $WT"; exit 1; }
[ -f "$WT/packages/contract/generated/client.ts" ] || { echo "FATAL: generated client missing"; exit 1; }
cd "$WT" || exit 1
echo "REV-07 · BLIND CODE REVIEW · Grok"
~/.grok/bin/grok -p "You are the blind CODE REVIEW seat REV-07 on mission public-debate-access, board public-debate-access. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then carry out the review it describes. Read your SKILLS first and open your handoff with SKILLS LOADED. Return control at READY FOR ROUTER or a genuine blocker." \
  -m grok-4.5 --permission-mode bypassPermissions < /dev/null 2>&1 | tee "$LOG"
echo "=== REV-07 seat exited. Log: $LOG ==="
