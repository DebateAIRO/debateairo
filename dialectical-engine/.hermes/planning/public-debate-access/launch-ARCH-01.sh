#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
PACKET=$REPO/.hermes/reports/public-debate-access/packets/ARCH-01.md
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-01-claude.log
if [ ! -f "$PACKET" ]; then echo "FATAL: packet missing at $PACKET"; exit 1; fi
cd "$REPO" || exit 1
echo "ARCH-01 · ARCHITECTURE seat · Claude · ticket t_f864a84b"
claude -p "You are the ARCHITECTURE seat on mission public-debate-access, board public-debate-access, ticket t_f864a84b. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly - it names your contract, your file permissions, the one technical fact most likely to make you design the wrong thing, your output skeleton and your bounds. Use the Skill tool to load heartbeat-protocol then heartbeat-architecture, and superpowers:brainstorming BEFORE you commit to a direction, then superpowers:writing-plans. You decide HOW, never WHAT: every SPEC.md is FROZEN and you never edit one. Note S02/SPEC.md is now v2 superseding SPEC-v1.md - read v2. Where you rely on a claim from INTAKE.md for a load-bearing step, verify it yourself and tag it MEASURED with your own command rather than inheriting it. Return control at READY FOR PEER REVIEW, a genuine blocker, or an IMPORTANT OPERATION; otherwise keep working and keep the session alive and resumable." \
  --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-01 seat exited. Log: $LOG ==="
