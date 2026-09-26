#!/bin/zsh
# ARCH-REV-PES-S02-p1 — the C2 and C3 commands name only paths the plan creates.
# run-suites.sh marks a missing file BROKEN, so the base run is this absence check.
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
for p in acceptance/pes-s02-fake-vendor.test.ts acceptance/pes-s02-fake-vendor.ts \
         acceptance/pes-s02-hosted.test.ts acceptance/pes-s02-hosted.ts acceptance/pes-s02-hosted-cli.ts \
         tests/support/devApiEnvironmentAssembly.ts; do
  if [ -e "$p" ]; then echo "PRESENT-AT-BASE $p"; else echo "ABSENT-AT-BASE $p"; fi
done
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
