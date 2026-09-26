#!/bin/zsh
# ARCH-REV-PES-S02-p2 — absence check for paths C2 and C3 create. Copied in spirit from
# ARCH-REV-PES-S02-p1/C2-C3-absent.sh and run here so that script is not edited.
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
for p in acceptance/pes-s02-fake-vendor.test.ts acceptance/pes-s02-fake-vendor.ts \
         acceptance/pes-s02-hosted.test.ts acceptance/pes-s02-hosted.ts acceptance/pes-s02-hosted-cli.ts \
         tests/support/devApiEnvironmentAssembly.ts; do
  if [ -e "$p" ]; then echo "PRESENT-AT-BASE $p"; else echo "ABSENT-AT-BASE $p"; fi
done
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
