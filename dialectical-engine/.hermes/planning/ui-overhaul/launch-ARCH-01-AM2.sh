#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM2-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM2.md
echo "[launch] $(date '+%F %T') ARCH-01-AM2 resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH micro-amendment 2: the Wave 0 review traced blocking finding B1 to your ADR-002 contract, plus an ADR-001 boundary hole, a missing compile-gate law, and an AF-1-class coverage hole. Full charge: $PACKET — read it first, follow exactly." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01-AM2 exited rc=$?" | tee -a "$LOG"
