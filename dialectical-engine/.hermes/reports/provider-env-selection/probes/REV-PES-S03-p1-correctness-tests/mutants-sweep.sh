#!/bin/zsh
# Class sweep: delete each price-code table row, run v9 and the architecture baseline.
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine
cd "$WT"
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-correctness-tests
CAPTURE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh
README=deploy/vps/README.md
cp "$README" "$ROOT/scratch/README.orig"
echo $$ > "$ROOT/mutants-sweep.pid"

restore() {
  cp "$ROOT/scratch/README.orig" "$README"
  local n
  n=$(git status --porcelain | wc -l | tr -d ' ')
  echo "RESTORE porcelain=$n"
  [ "$n" = "0" ] || { git status --porcelain; exit 3; }
}

for prefix in "| \`PROVIDER_TARGET_PRICE_ZERO:" "| \`PROVIDER_TARGET_PRICE_REQUIRED:" "| \`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID\` |"; do
  name=$(printf '%s' "$prefix" | tr -c 'A-Z' '-' | tr -s '-')
  echo "===== SWEEP $name ====="
  python3 - "$prefix" "$WT/$README" <<'PY'
import pathlib, sys
prefix, path = sys.argv[1:]
file = pathlib.Path(path)
lines = file.read_text().split("\n")
kept = [line for line in lines if not line.startswith(prefix)]
if len(kept) == len(lines):
    raise SystemExit(f"not found: {prefix}")
file.write_text("\n".join(kept))
print("dropped", prefix)
PY
  LOG="$ROOT/sweep-${name}-v9.log" zsh "$CAPTURE" pnpm exec vitest run tests/unit/v9-provider-credential-files.test.ts
  echo "V9_RC $?"
  LOG="$ROOT/sweep-${name}-baseline.log" zsh "$CAPTURE" pnpm exec vitest run tests/architecture/vps-deployment-baseline.test.ts
  echo "BASE_RC $?"
  restore
done
rm -f "$ROOT/mutants-sweep.pid"
echo "sweep-finished porcelain $(git status --porcelain | wc -l | tr -d ' ')"
