#!/bin/zsh
# ARCH-PES-S01 probe p3 — which stream carries pnpm 11's `$ <command>` script echo, and what a failing script
# adds after it. Uses the read-only `audit:text-bytes` script (tools/check-text-control-bytes.ts writes nothing)
# and `pnpm run typecheck`'s known exit 1 is NOT re-run; a failing script is simulated with `pnpm exec false`?
# no — pnpm exec prints no echo. The failing-script shape is read from base-typecheck.log (captured 2>&1).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
pnpm --version > $D/p3-pnpm-version.txt 2>&1
pnpm audit:text-bytes > $D/p3-stdout.txt 2> $D/p3-stderr.txt
echo "rc=$?" > $D/p3-rc.txt
