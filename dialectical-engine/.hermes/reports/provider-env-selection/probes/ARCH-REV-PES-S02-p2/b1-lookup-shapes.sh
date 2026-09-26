#!/bin/zsh
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty-before $(git status --porcelain | wc -l | tr -d ' ')"
echo "== tsc"
./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module nodenext --moduleResolution nodenext --types node --typeRoots "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine/node_modules/@types" --skipLibCheck --ignoreConfig "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S02-p2/b1-lookup-shapes.ts"; echo "tsc rc=$?"
echo "== run"
./node_modules/.bin/tsx --no-cache "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S02-p2/b1-lookup-shapes.ts"
echo "dirty-after $(git status --porcelain | wc -l | tr -d ' ')"
