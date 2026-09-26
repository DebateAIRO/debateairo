#!/bin/zsh
# ARCH-PES-S03 · `pnpm typecheck` at base IN THE SLICE LANE (the intake measured it in pes-base).
# Judged by the per-file DELTA, never by rc (00-intake.md §5b; COMMON §6; SPEC §4).
# Intake baseline: rc=1, 1 diagnostic — apps/ui/lib/v3/answerExport.ts(2,38) TS2835.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
out=$(pnpm typecheck 2>&1); rc=$?
printf '%s\n' "$out"
echo "===== rc=$rc ====="
echo "===== DIAGNOSTIC LINES, one per file:(line,col) ====="
printf '%s\n' "$out" | /usr/bin/grep -E '\([0-9]+,[0-9]+\): error TS[0-9]+' | sort
echo "===== COUNT ====="
printf '%s\n' "$out" | /usr/bin/grep -cE '\([0-9]+,[0-9]+\): error TS[0-9]+'
