#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM10-claude.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM10.md
echo "[launch] $(date '+%F %T') ARCH-01-AM10 resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH micro-amendment 10, one charge: T9-C4-4 pins bodies as containment while T9-C4-1 pins titles positionally — the same-subtree permutation ships green. Amend the cell to positional pairing; note the open Q-16 in the row. Full charge: $PACKET." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') ARCH-01-AM10 exited rc=$?" | tee -a "$LOG"
