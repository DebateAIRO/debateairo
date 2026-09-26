#!/bin/zsh
# Clean-env d1 (unset the harness colour pair) and the F10 acceptance mutant via node --import tsx,
# the spawn K6 uses. pnpm is not on this path: TMPDIR=/nonexistent kills pnpm before the script.
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
cd "$L" || exit 3
TSX=$(node -e 'console.log(require.resolve("tsx"))')
echo "tsx=$TSX"

echo "===== clean d1 ====="
env -u NO_COLOR -u FORCE_COLOR PATH="$PATH" HOME="$HOME" \
  pnpm exec tsx --tsconfig "$D/tsconfig.proposed.json" "$D/proposed-copy/p8-acceptance-dry-run.ts" \
  > "$D/d1-clean-stdout.txt" 2> "$D/d1-clean-stderr.txt"
echo "rc=$?" | tee "$D/d1-clean-rc.txt"
echo "stderr-bytes=$(wc -c < "$D/d1-clean-stderr.txt" | tr -d ' ')" | tee -a "$D/d1-clean-rc.txt"
echo "lines=$(wc -l < "$D/d1-clean-stdout.txt" | tr -d ' ') last=$(tail -n 1 "$D/d1-clean-stdout.txt")" | tee -a "$D/d1-clean-rc.txt"

run_one() {
  name=$1
  file=$2
  env -i PATH="$PATH" HOME="$HOME" TSX_DISABLE_CACHE=1 TMPDIR=/nonexistent/pes-s01-rev-p2 \
    TSX_TSCONFIG_PATH="$D/tsconfig.proposed.json" \
    node --import "$TSX" "$file" > "$D/$name-stdout.txt" 2> "$D/$name-stderr.txt"
  echo "$name rc=$? lines=$(wc -l < "$D/$name-stdout.txt" | tr -d ' ') stderr-bytes=$(wc -c < "$D/$name-stderr.txt" | tr -d ' ')"
  echo "  stdout: $(cat "$D/$name-stdout.txt")"
}
echo "===== UNVERIFIED via process.exitCode ====="
run_one f10-exitcode "$D/scratch/m-exitcode/p8-acceptance-dry-run.ts"
echo "===== UNVERIFIED via process.exit ====="
run_one f10-exit "$D/scratch/m-exit/p8-acceptance-dry-run.ts"
echo "dirty $(git status --porcelain | wc -l | tr -d ' ')"
echo "F10 DONE"
