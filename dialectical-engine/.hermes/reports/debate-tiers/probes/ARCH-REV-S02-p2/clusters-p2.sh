#!/bin/zsh
# ARCH-REV-S02-p2 · re-run of EVERY command PLAN.md Revision 2 publishes, at base, in the S02 lane.
# Read-only: nothing is written into the lane; git status --porcelain asserted 0 before and after.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine
OUT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/probes/ARCH-REV-S02-p2
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

# ---- PLAN.md Rev2 §5 cluster commands (the gate commands) ----
# :711  S02-C1
run C1 pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts
# :712  S02-C3
run C3 pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts
# :713  S02-C2
run C2 pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts
# :714  S02-C4
run C4 pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts

# ---- the step-local RED-frame commands the revision now publishes ----
# :278  S02-C1-S3 RED frame (single file, TDD-created)
run C1RED pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts
# :511  S02-C2-S2 RED frame (single file, TDD-created)
run C2RED pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts
# :672  S02-C4-S2 RED frame (single file, TDD-created)
run C4RED pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts

# ---- §6 probes ----
# :723  probe 3, the silent-drop gate
run P3 pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/contract.test.ts
# :756  probe 4 / F-4
run P4 pnpm exec vitest run tests/integration/register-version-boundaries.test.ts

# ---- :806  the slice verification command (S02-V*) ----
run V806 pnpm exec vitest run tests/unit/api.test.ts tests/unit/contract.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/architecture/s14-contract.test.ts

# ---- per-file base counts, for the F-7 post-rebase arithmetic ----
run F_api      pnpm exec vitest run tests/unit/api.test.ts
run F_contract pnpm exec vitest run tests/unit/contract.test.ts
run F_evaldb   pnpm exec vitest run tests/integration/evaluator-database.test.ts
run F_s14      pnpm exec vitest run tests/architecture/s14-contract.test.ts
run F_load01   pnpm exec vitest run tests/unit/load01-live-proof.test.ts
run F_s7auth   pnpm exec vitest run tests/unit/s7-authorization.test.ts

echo ""
echo "### dirty AFTER: $(git status --porcelain | wc -l | tr -d ' ')"
echo "### lane HEAD AFTER: $(git rev-parse --short HEAD)"
echo "### done: $(date '+%Y-%m-%d %H:%M:%S %Z')"
