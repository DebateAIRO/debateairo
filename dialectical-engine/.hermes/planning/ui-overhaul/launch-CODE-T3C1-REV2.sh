#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T3C1-REV2-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T3C1-REV2.md
echo "[launch] $(date '+%F %T') CODE-T3C1-REV2 resume 6cf246a8" | tee "$LOG"
claude --resume 6cf246a8-927e-4de0-99a0-e85605d01e61 -p "Re-review of T3-C1 rework round 1, frozen at commit af2d590: the worker implemented your verified trio (adopted verbatim as the AM7 cell), pinned the authTopBar mount per the new T3-C1-5 cell, and shipped your N2 code half. Your charge: $PACKET — read it first, follow exactly. Re-apply your own M1b and M6, one new probe, verdict PASS (closes Wave 1) or REWORK round 2." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T3C1-REV2 exited rc=$?" | tee -a "$LOG"
