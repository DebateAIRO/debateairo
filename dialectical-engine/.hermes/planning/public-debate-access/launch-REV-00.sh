#!/bin/zsh
WT=/private/tmp/debateai-rev00/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/REV-00.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/REV-00-grok.log
if [ ! -f "$PACKET" ]; then echo "FATAL: packet missing at $PACKET"; exit 1; fi
if [ ! -d "$WT" ]; then echo "FATAL: worktree missing at $WT"; exit 1; fi
cd "$WT" || exit 1
echo "REV-00 · PACKET REVIEW seat · Grok · ticket t_a12687d5 · blind lens in worktree $WT"
~/.grok/bin/grok -p "You are the PACKET REVIEW seat on mission public-debate-access, board public-debate-access, ticket t_a12687d5. You are a BLIND lens: you review the ORCHESTRATOR's own intake and packet, and you have deliberately been given an isolated git worktree that does NOT contain the requirements seat's in-progress output. Do not go looking for it. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly - it names your contract, what to probe, your output skeleton and your file permissions. Your default posture is to REFUTE the Router's measured claims by running your own probes, not by reading and agreeing. The live dev server on https://localhost:3000 is reachable for anonymous probes. Return control at your verdict, a genuine blocker, or an IMPORTANT OPERATION; otherwise keep working and keep the session alive and resumable." \
  -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== REV-00 seat exited. Log: $LOG ==="
