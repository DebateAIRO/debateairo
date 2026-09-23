#!/bin/zsh
# ARCH-REV-S03 — my own re-run of the four cluster commands of PLAN.md §2 at base.
# cwd is the S03 lane, read-only. Capture-first: every command's full output to its own log.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
OUT=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/ARCH-REV-S03
cd "$LANE" || exit 99

echo "=== lane state ==="
git rev-parse --short HEAD
git status --porcelain | wc -l
echo "=== new paths the plan says are created (must NOT exist at base) ==="
for p in tests/unit/model-config-file.test.ts tests/unit/model-config-shape.test.ts tests/unit/model-config-tiers.test.ts tests/architecture/model-config-no-secret.test.ts tests/unit/provider-base-url-admission.test.ts tests/unit/provider-discovery-uncredentialed.test.ts packages/model-config config/models.yaml packages/contract/src/plan-tiers.ts apps/runner/src/dev-provider-keys.ts tests/unit/tiers-s02-wire.test.ts; do
  if [ -e "$p" ]; then echo "EXISTS  $p"; else echo "absent  $p"; fi
done

# C1 — existing paths only (four new paths omitted, per the plan's own base rule)
echo "=== C1 ==="
LANG=en_US.UTF-8 npx vitest run tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts > "$OUT/rev-c1.log" 2>&1
echo "C1 rc=$?"

# C2 — existing paths only (two new paths omitted)
echo "=== C2 ==="
LANG=en_US.UTF-8 npx vitest run tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts > "$OUT/rev-c2.log" 2>&1
echo "C2 rc=$?"

# C3 — the full command; no path in it is new per the plan
echo "=== C3 ==="
LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts > "$OUT/rev-c3.log" 2>&1
echo "C3 rc=$?"

# C4 — the full command as written in the plan
echo "=== C4 (as written in the plan) ==="
LANG=en_US.UTF-8 npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts > "$OUT/rev-c4.log" 2>&1
echo "C4 rc=$?"

echo "=== done ==="
date '+%Y-%m-%d %H:%M:%S %Z'
