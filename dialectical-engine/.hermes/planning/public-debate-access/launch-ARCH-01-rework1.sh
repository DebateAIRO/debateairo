#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
BRIEF=$REPO/.hermes/reports/public-debate-access/packets/ARCH-01-rework1.md
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-01-rework1-claude.log
[ -f "$BRIEF" ] || { echo "FATAL: brief missing at $BRIEF"; exit 1; }
cd "$REPO" || exit 1
echo "ARCH-01 REWORK ROUND 1 of 3 · mission public-debate-access · ticket t_f864a84b · session $SID"
claude --resume "$SID" -p "REWORK ROUND 1 of max 3 on your architecture plan. Your rework brief is at $BRIEF - read it IN FULL first and follow it exactly. One BLOCKING finding (B1: replay_handle leaks to anonymous readers via the wholesale node/edge copy you planned) plus six non-blocking findings that are yours. Reproduce B1's evidence yourself with the greps named in the brief BEFORE you patch anything; if it does not hold, say so and change nothing. NEW LAW since you last ran: your handoff must OPEN with a SKILLS LOADED line naming every skill you actually loaded - you are not charged for its absence last time, it did not exist yet. SPECs stay FROZEN; you edit PLAN.md and APPEND to DECISIONS.md only. Return control at REWORK READY FOR REVIEW, a genuine blocker, or an IMPORTANT OPERATION." \
  --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-01 rework round 1 exited. Log: $LOG ==="
