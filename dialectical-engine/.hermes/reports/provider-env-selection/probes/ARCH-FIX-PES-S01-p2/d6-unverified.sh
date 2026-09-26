#!/bin/zsh
# ARCH-FIX-PES-S01-p2 probe d6 — SPEC-v4 §5 step 6's UNVERIFIED outcome, end to end: TMPDIR names a directory that
# does not exist, so startTestDatabase's mkdtemp (tests/support/testDatabase.ts:84) throws before any server starts.
# tsx needs TSX_DISABLE_CACHE=1 here (its disk cache lives under TMPDIR; first run showed ENOENT mkdir tsx-501).
# Run with node --import tsx (no pnpm) exactly as the K6 case spawns the entry; reference code and m3 (exitCode) both.
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
cd $L || exit 3
TSX=$(node -e 'console.log(require.resolve("tsx"))')
for P in proposed m3-exitcode-not-exit; do
  env -i PATH="$PATH" HOME="$HOME" TSX_DISABLE_CACHE=1 TMPDIR=/nonexistent/pes-s01-d6 TSX_TSCONFIG_PATH=$D/tsconfig.proposed.json \
    node --import $TSX $D/$P/p8-acceptance-dry-run.ts > $D/d6-$P-stdout.txt 2> $D/d6-$P-stderr.txt
  echo "$P: rc=$? · stdout lines=$(wc -l < $D/d6-$P-stdout.txt | tr -d ' ') · last: $(tail -1 $D/d6-$P-stdout.txt) · stderr bytes=$(wc -c < $D/d6-$P-stderr.txt | tr -d ' ')"
done
echo "lane dirty after: $(git -C $L status --porcelain | wc -l | tr -d ' ')"
