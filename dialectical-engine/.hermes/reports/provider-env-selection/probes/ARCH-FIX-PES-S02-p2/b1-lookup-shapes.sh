#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — B1 detector: typecheck the PLAN's two code blocks against the lane's @types/node, then run them
# (GREEN shapes must resolve; MUTANTS M1-M3 must not). Lane read-only; listener on a lsof-free port in 4460-4499 only.
set -u
export PATH="/opt/homebrew/bin:$PATH"
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2
cd "$L" || exit 2
echo "== tsc --noEmit --strict on the probe (the PLAN's code blocks are in it verbatim)"
./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module nodenext --moduleResolution nodenext \
  --types node --typeRoots "$L/node_modules/@types" --skipLibCheck --ignoreConfig "$P/b1-lookup-shapes.ts"; echo "tsc rc=$?"
echo "== run"
./node_modules/.bin/tsx --no-cache "$P/b1-lookup-shapes.ts" 2>&1 | grep -v -E 'NO_COLOR|trace-warnings'
echo "lane: HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
