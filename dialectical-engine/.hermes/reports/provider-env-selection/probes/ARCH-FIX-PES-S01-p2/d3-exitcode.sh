#!/bin/zsh
# ARCH-FIX-PES-S01-p2 probe d3 — exit-code propagation under tsx, with and without the embedded database.
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
cd $L || exit 3
for f in d3-exitcode-plain d3-exitcode-db; do
  pnpm exec tsx --tsconfig $D/tsconfig.proposed.json $D/debug/$f.ts; echo "$f via pnpm exec tsx: rc=$?"
  node --import "$(node -e 'console.log(require.resolve("tsx"))')" $D/debug/$f.ts; echo "$f via node --import tsx: rc=$?"
done
