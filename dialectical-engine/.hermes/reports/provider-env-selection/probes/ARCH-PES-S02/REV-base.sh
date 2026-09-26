#!/bin/zsh
# ARCH-PES-S02 — the two acceptance commands of SPEC-v3 §5 (steps 2 and 4) run at base 776359c3 in the
# S02 lane (read-only), each captured. Both are expected RED at base: step 2's filter matches no case
# (S02-S02 adds the two), step 4's script does not exist (S02-S19 adds it).
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S02
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh
LOG="$P/REV-base-step2.log" zsh "$R" pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'
echo "---"
LOG="$P/REV-base-step4.log" zsh "$R" pnpm pes:accept-hosted
echo "--- step-4 log tail"
tail -n 5 "$P/REV-base-step4.log"
echo "git HEAD $(git rev-parse --short HEAD) · dirty $(git status --porcelain | wc -l | tr -d ' ')"
