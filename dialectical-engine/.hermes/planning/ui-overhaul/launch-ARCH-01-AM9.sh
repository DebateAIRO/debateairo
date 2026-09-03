#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM9-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM9.md
echo "[launch] $(date '+%F %T') ARCH-01-AM9 resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH micro-amendment 9, three calls from the T9-C2 review: ratify-or-drop the chrome auth links, reconcile ADR-004's Decision-vs-Wiring contradiction on sign-up forwarding, and rule on the declared kind admitting dot refs. Full charge: $PACKET — read it first, follow exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01-AM9 exited rc=$?" | tee -a "$LOG"
