#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/qa-01/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/QA-01.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/QA-01-grok.log
[ -f "$PACKET" ] || { echo "FATAL: packet missing at $PACKET"; exit 1; }
[ -d "$WT" ]     || { echo "FATAL: worktree missing at $WT"; exit 1; }
[ -f "$WT/packages/contract/generated/client.ts" ] || { echo "FATAL: generated client missing"; exit 1; }
cd "$WT" || exit 1
echo "QA-01 · QA LOOP · Grok · ticket t_cb2dd94d"
~/.grok/bin/grok -p "You are the QA seat QA-01 on mission public-debate-access, board public-debate-access, ticket t_cb2dd94d. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then carry out the QA it describes. The live dev stack is already running at https://localhost:3000 with a self-signed certificate - use curl -sk. Under V's standing ruling you must NOT stop, restart, swap or reconfigure that server, and must not change its port. Read your SKILLS first and open your handoff with SKILLS LOADED. Return control at READY FOR ROUTER or a genuine blocker." \
  -m grok-4.5 --permission-mode bypassPermissions < /dev/null 2>&1 | tee "$LOG"
echo "=== QA-01 exited. Log: $LOG ==="
