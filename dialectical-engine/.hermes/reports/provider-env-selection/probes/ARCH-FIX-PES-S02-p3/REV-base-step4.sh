#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — SPEC-v4 §5 step 4 typed as V types it (SPEC-v4.md:231), at base in the S02 lane (read-only):
# S02-S19's RED-when-omitted evidence in the new command form. The log goes to this probes dir, not /tmp.
set -u
export PATH="/opt/homebrew/bin:$PATH"
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p3
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
pnpm pes:accept-hosted > $Q/REV-base-step4.log 2>&1; echo "exit=$?"
echo "-- log ($(wc -l < $Q/REV-base-step4.log | tr -d ' ') lines):"; cat $Q/REV-base-step4.log
echo "lane: HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
