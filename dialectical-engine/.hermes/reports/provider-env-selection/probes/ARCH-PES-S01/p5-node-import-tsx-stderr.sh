#!/bin/zsh
# ARCH-PES-S01 probe p5 — does `node --import tsx <file>` (the spawn shape of tests/integration/dev-deployment-register.test.ts:118-122)
# print anything on stderr under node 26.9.0 + tsx 4.23.11? Entry: probe p1 (pure, read-only).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
TSX=$(node -e 'console.log(require.resolve("tsx"))')
echo "tsx=$TSX node=$(node --version)" > $D/p5-meta.txt
node --import "$TSX" $D/p1-shipped-chain.ts > $D/p5-stdout.txt 2> $D/p5-stderr.txt; echo "rc=$?" >> $D/p5-meta.txt
