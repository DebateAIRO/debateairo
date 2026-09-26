#!/bin/zsh
# ARCH-PES-S01 probe p8 runner — the §5 dry run with the PLAN's proposed code; stdout and stderr kept apart so the
# stdout contract of SPEC-v3 §5 steps 3-6 is read on its own. :55432 recorded before and after (step 1 / step 7).
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
cd $L || exit 3
lsof -nP -iTCP:55432 -sTCP:LISTEN > $D/p8-lsof-55432-before.txt 2>&1
pnpm exec tsx --tsconfig $D/tsconfig.proposed.json $D/proposed/p8-acceptance-dry-run.ts > $D/p8-stdout.txt 2> $D/p8-stderr.txt
echo "rc=$?" > $D/p8-rc.txt
lsof -nP -iTCP:55432 -sTCP:LISTEN > $D/p8-lsof-55432-after.txt 2>&1
port=$(sed -n 's/^PES-S01 SCRATCH-DB port=\([0-9]*\) .*/\1/p' $D/p8-stdout.txt)
echo "port=$port" >> $D/p8-rc.txt
lsof -nP -iTCP:$port -sTCP:LISTEN >> $D/p8-rc.txt 2>&1; echo "lsof-on-port rc=$? (1 = nothing listening)" >> $D/p8-rc.txt
echo "Bearer lines in stdout+stderr: $(cat $D/p8-stdout.txt $D/p8-stderr.txt | grep -c Bearer)" >> $D/p8-rc.txt
echo "lane dirty after: $(git -C $L status --porcelain | wc -l | tr -d ' ')" >> $D/p8-rc.txt
