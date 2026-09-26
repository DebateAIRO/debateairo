#!/bin/zsh
# ARCH-REV-PES-S03-p1 · pnpm typecheck in the slice lane. Delta per file, never rc.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
out=$(pnpm typecheck 2>&1); rc=$?
printf '%s\n' "$out"
echo "===== rc=$rc ====="
echo "===== DIAGNOSTIC LINES ====="
printf '%s\n' "$out" | /usr/bin/grep -E '\([0-9]+,[0-9]+\): error TS[0-9]+' | sort
echo "===== COUNT ====="
printf '%s\n' "$out" | /usr/bin/grep -cE '\([0-9]+,[0-9]+\): error TS[0-9]+'
