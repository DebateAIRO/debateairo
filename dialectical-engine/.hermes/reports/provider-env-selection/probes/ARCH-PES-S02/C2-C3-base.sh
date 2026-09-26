#!/bin/zsh
# ARCH-PES-S02 — clusters S02-C2 and S02-C3 at base 776359c3 in the S02 lane (read-only).
# Each cluster's ONE command names only a suite a step CREATES (C2: S02-S13, C3: S02-S17), so per the packet
# (ARCH-S02.md §2 verification) the path is OMITTED from the base run. This script proves the omission is
# mechanical: every path the two commands name is absent at base, and so is every module those suites import.
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
for p in acceptance/pes-s02-fake-vendor.test.ts acceptance/pes-s02-fake-vendor.ts \
         acceptance/pes-s02-hosted.test.ts acceptance/pes-s02-hosted.ts acceptance/pes-s02-hosted-cli.ts \
         tests/support/devApiEnvironmentAssembly.ts; do
  if [ -e "$p" ]; then echo "PRESENT-AT-BASE $p (plan defect: a created path already exists)"; else echo "ABSENT-AT-BASE $p (created by the plan)"; fi
done
echo "git HEAD $(git rev-parse --short HEAD) · dirty $(git status --porcelain | wc -l | tr -d ' ')"
