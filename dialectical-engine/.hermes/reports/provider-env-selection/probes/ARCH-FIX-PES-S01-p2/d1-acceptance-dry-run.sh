#!/bin/zsh
# ARCH-FIX-PES-S01-p2 probe d1 — SPEC-v4 §5 dry run with the Revision-2 reference code (role seed, 7 cases, exit rule).
# Usage: d1-acceptance-dry-run.sh <tag> [proposed-dir]   (a mutant run passes a mutant copy of proposed/)
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
T=${1:-d1}; P=${2:-$D/proposed}
cd $L || exit 3
lsof -nP -iTCP:55432 -sTCP:LISTEN > $D/$T-lsof-55432-before.txt 2>&1
pnpm exec tsx --tsconfig $D/tsconfig.proposed.json $P/p8-acceptance-dry-run.ts > $D/$T-stdout.txt 2> $D/$T-stderr.txt
echo "rc=$?" > $D/$T-rc.txt
lsof -nP -iTCP:55432 -sTCP:LISTEN > $D/$T-lsof-55432-after.txt 2>&1
port=$(sed -n 's/^PES-S01 SCRATCH-DB port=\([0-9]*\) .*/\1/p' $D/$T-stdout.txt)
echo "port=$port" >> $D/$T-rc.txt
[ -n "$port" ] && { lsof -nP -iTCP:$port -sTCP:LISTEN >> $D/$T-rc.txt 2>&1; echo "lsof-on-port rc=$? (1 = nothing listening)" >> $D/$T-rc.txt; }
echo "stdout lines: $(wc -l < $D/$T-stdout.txt | tr -d ' ')" >> $D/$T-rc.txt
echo "Bearer lines in stdout+stderr: $(cat $D/$T-stdout.txt $D/$T-stderr.txt | grep -c Bearer)" >> $D/$T-rc.txt
echo "55432 same: $(cmp -s $D/$T-lsof-55432-before.txt $D/$T-lsof-55432-after.txt && echo yes || echo NO)" >> $D/$T-rc.txt
echo "lane dirty after: $(git -C $L status --porcelain | wc -l | tr -d ' ')" >> $D/$T-rc.txt
