#!/bin/zsh
WT=/private/tmp/debateai-rev01/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/REV-01.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/REV-01-claude.log
if [ ! -f "$PACKET" ]; then echo "FATAL: packet missing at $PACKET"; exit 1; fi
if [ ! -d "$WT" ]; then echo "FATAL: worktree missing at $WT"; exit 1; fi
cd "$WT" || exit 1
echo "REV-01 · SPEC REVIEW seat · Claude · ticket t_2a279210 · blind lens in worktree $WT"
claude -p "You are the SPEC REVIEW seat on mission public-debate-access, board public-debate-access, ticket t_2a279210. You are a BLIND lens reviewing the requirements seat's frozen SPECs; your worktree deliberately excludes the other review lens's output, so do not go looking for it. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly - it names your contract, what to probe, your output skeleton, your board scoping and your file permissions. Use the Skill tool to load heartbeat-protocol then heartbeat-reviewer, and superpowers:verification-before-completion at minimum. Your default posture is to REFUTE: where a SPEC asserts something about the codebase, verify it yourself rather than inheriting it from INTAKE.md, which is the Router's work and is also under suspicion. Return control at your verdict, a genuine blocker, or an IMPORTANT OPERATION; otherwise keep working and keep the session alive and resumable." \
  --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== REV-01 seat exited. Log: $LOG ==="
