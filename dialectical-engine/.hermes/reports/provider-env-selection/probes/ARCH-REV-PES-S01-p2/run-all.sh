#!/bin/zsh
# ARCH-REV-PES-S01-p2 · re-run the four base cluster commands, the missing-path BROKEN check,
# the acceptance dry run, the role-seed remedy, and an exitCode mutant. Writes only under this dir.
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
FIX=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
cd "$L" || exit 3
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
echo "===== NO-TOUCH before ====="
for p in 3000 3001 4310 8790 8793 8795 8796 55432; do
  echo -n ":$p "
  lsof -nP -iTCP:$p -sTCP:LISTEN | awk 'NR==1{next} {print $1,$2}' | tr '\n' ' '
  echo
done
lsof -nP -iTCP:55432 -sTCP:LISTEN > "$D/lsof-55432-before.txt"

marker() { echo "MARKER $1 :: $(tail -n 1 "$D/$1.log")"; }

echo "===== C1 ====="
zsh "$D/base-C1.sh"; marker base-C1
echo "===== C2 ====="
zsh "$D/base-C2.sh"; marker base-C2
echo "===== C3 ====="
zsh "$D/base-C3.sh"; marker base-C3
echo "===== C4 ====="
zsh "$D/base-C4.sh"; marker base-C4
echo "===== literal missing C2 ====="
zsh "$D/literal-missing-C2.sh"; marker literal-missing-C2

echo "===== d3 plain (exitCode, no database) expect rc=1 ====="
pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$FIX/debug/d3-exitcode-plain.ts" > "$D/d3-plain-stdout.txt" 2> "$D/d3-plain-stderr.txt"
echo "rc=$?" | tee "$D/d3-plain-rc.txt"

echo "===== d3 db (exitCode after start/stop) expect rc=0 ====="
pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$FIX/debug/d3-exitcode-db.ts" > "$D/d3-db-stdout.txt" 2> "$D/d3-db-stderr.txt"
echo "rc=$?" | tee "$D/d3-db-rc.txt"

echo "===== d4 role-seed remedy ====="
pnpm exec tsx --tsconfig "$FIX/tsconfig.proposed.json" "$FIX/debug/d4-role-seed-remedy.ts" > "$D/d4-stdout.txt" 2> "$D/d4-stderr.txt"
echo "rc=$?" | tee "$D/d4-rc.txt"

echo "===== d1 acceptance (process.exit) expect PASS rc=0 ====="
lsof -nP -iTCP:55432 -sTCP:LISTEN > "$D/d1-lsof-55432-before.txt"
pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$D/proposed-copy/p8-acceptance-dry-run.ts" > "$D/d1-stdout.txt" 2> "$D/d1-stderr.txt"
echo "rc=$?" | tee "$D/d1-rc.txt"
lsof -nP -iTCP:55432 -sTCP:LISTEN > "$D/d1-lsof-55432-after.txt"
port=$(sed -n 's/^PES-S01 SCRATCH-DB port=\([0-9]*\) .*/\1/p' "$D/d1-stdout.txt")
echo "port=$port" | tee -a "$D/d1-rc.txt"
if [ -n "$port" ]; then
  lsof -nP -iTCP:"$port" -sTCP:LISTEN > "$D/d1-lsof-port.txt" 2>&1
  echo "lsof-on-port-lines=$(wc -l < "$D/d1-lsof-port.txt" | tr -d ' ')" | tee -a "$D/d1-rc.txt"
fi
echo "stdout-lines=$(wc -l < "$D/d1-stdout.txt" | tr -d ' ')" | tee -a "$D/d1-rc.txt"
echo "stderr-bytes=$(wc -c < "$D/d1-stderr.txt" | tr -d ' ')" | tee -a "$D/d1-rc.txt"
echo "bearer=$(grep -c Bearer "$D/d1-stdout.txt" "$D/d1-stderr.txt" || true)" | tee -a "$D/d1-rc.txt"
echo "last=$(tail -n 1 "$D/d1-stdout.txt")" | tee -a "$D/d1-rc.txt"

echo "===== m-exitcode (same dry run, process.exitCode) expect PASS line but rc=0 only if the run passed; FAIL path uses TMPDIR ====="
# Passing run would exit 0 either way. Force the UNVERIFIED path so the code is 1.
TMPDIR=/nonexistent/pes-s01-rev-p2 TSX_DISABLE_CACHE=1 \
  pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$D/scratch/m-exitcode/p8-acceptance-dry-run.ts" \
  > "$D/m-exitcode-stdout.txt" 2> "$D/m-exitcode-stderr.txt"
echo "rc=$?" | tee "$D/m-exitcode-rc.txt"
echo "stdout=$(cat "$D/m-exitcode-stdout.txt")" | tee -a "$D/m-exitcode-rc.txt"
echo "stderr-bytes=$(wc -c < "$D/m-exitcode-stderr.txt" | tr -d ' ')" | tee -a "$D/m-exitcode-rc.txt"

echo "===== control: process.exit(1) on the same UNVERIFIED path ====="
# copy once more and keep process.exit, run under the bad TMPDIR
rm -rf "$D/scratch/m-exit"
cp -R "$D/proposed-copy" "$D/scratch/m-exit"
TMPDIR=/nonexistent/pes-s01-rev-p2b TSX_DISABLE_CACHE=1 \
  pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$D/scratch/m-exit/p8-acceptance-dry-run.ts" \
  > "$D/m-exit-stdout.txt" 2> "$D/m-exit-stderr.txt"
echo "rc=$?" | tee "$D/m-exit-rc.txt"
echo "stdout=$(cat "$D/m-exit-stdout.txt")" | tee -a "$D/m-exit-rc.txt"

echo "===== lane after ====="
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
git status --porcelain > "$D/lane-porcelain.txt"
echo "===== NO-TOUCH after ====="
for p in 3000 3001 4310 8790 8793 8795 8796 55432; do
  echo -n ":$p "
  lsof -nP -iTCP:$p -sTCP:LISTEN | awk 'NR==1{next} {print $1,$2}' | tr '\n' ' '
  echo
done
lsof -nP -iTCP:55432 -sTCP:LISTEN > "$D/lsof-55432-after.txt"
echo "ALL DONE"
