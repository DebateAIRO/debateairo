#!/bin/zsh
# ARCH-REV-S02 · re-run of EVERY cluster command of PLAN.md §5 at base, in the S02 lane.
# Read-only: nothing is written into the lane; git status --porcelain is asserted 0 before and after.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine
OUT=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-REV-S02
cd "$LANE" || exit 99

echo "### lane HEAD: $(git rev-parse --short HEAD)  branch: $(git rev-parse --abbrev-ref HEAD)"
echo "### dirty BEFORE: $(git status --porcelain | wc -l | tr -d ' ')"
echo "### date: $(date '+%Y-%m-%d %H:%M:%S %Z')"

run () {
  local tag="$1"; shift
  echo ""
  echo "===== $tag ====="
  echo "\$ $*"
  local t0=$(date +%s)
  "$@" > "$OUT/$tag.log" 2>&1
  local rc=$?
  local t1=$(date +%s)
  echo "rc=$rc  wall=$((t1-t0))s"
  grep -E '^ *Test Files|^ *Tests |^ *Duration' "$OUT/$tag.log" | sed 's/^/  /'
  echo "--- failure titles (if any) ---"
  grep -E '^ *(FAIL|× |✕ )' "$OUT/$tag.log" | head -20 | sed 's/^/  /'
}

# PLAN.md §5, cluster S02-C1
run C1 pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts

# PLAN.md §5, cluster S02-C3
run C3 pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts

# PLAN.md §5, cluster S02-C2 -- AS WRITTEN, including the integration file the ARCH seat omitted
run C2 pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts

# PLAN.md §5, cluster S02-C4
run C4 pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts

# PLAN.md §6 probe 3 -- the silent-drop trap the file-count gate rests on
run P3 pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/contract.test.ts

# PLAN.md §6 probe 4 / finding F-4
run P4 pnpm exec vitest run tests/integration/register-version-boundaries.test.ts

echo ""
echo "### dirty AFTER: $(git status --porcelain | wc -l | tr -d ' ')"
echo "### lane HEAD AFTER: $(git rev-parse --short HEAD)"
echo "### done: $(date '+%Y-%m-%d %H:%M:%S %Z')"
