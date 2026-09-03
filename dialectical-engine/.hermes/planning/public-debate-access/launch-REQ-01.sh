#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
PACKET=$REPO/.hermes/reports/public-debate-access/packets/REQ-01.md
LOG=$REPO/.hermes/planning/public-debate-access/logs/REQ-01-grok.log
if [ ! -f "$PACKET" ]; then echo "FATAL: packet missing at $PACKET"; exit 1; fi
cd "$REPO" || exit 1
echo "REQ-01 · REQUIREMENTS seat · Grok · ticket t_5c7a1e7f · packet $PACKET"
~/.grok/bin/grok -p "You are the REQUIREMENTS seat on mission public-debate-access, board public-debate-access, ticket t_5c7a1e7f. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly - it names your contract, your file permissions, your output skeleton and your stopping rule. Do not start by exploring the repo: the packet points you at docs/missions/public-debate-access/INTAKE.md which already holds the measured ground truth. Return control at READY FOR PEER REVIEW, a genuine blocker, or an IMPORTANT OPERATION; otherwise keep working and keep the session alive and resumable." \
  -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== REQ-01 seat exited. Log: $LOG ==="
