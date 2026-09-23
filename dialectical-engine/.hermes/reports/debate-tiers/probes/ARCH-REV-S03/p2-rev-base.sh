#!/bin/zsh
# ARCH-REV-S03 pass 2 — the four cluster commands AS THEY NOW STAND (PLAN Revision 2 §2 :844-847),
# re-run by me at base in the lane. Capture-first. New paths omitted at base, per the plan's own rule.
# The two embedded-postgres suites the packet forbids are NOT run anywhere here.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
OUT=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/ARCH-REV-S03
cd "$LANE" || exit 99

echo "=== lane state ==="; git rev-parse --short HEAD; git status --porcelain | wc -l

echo "=== C1 (gained tests/architecture/dev-deployment-register.test.ts) ==="
LANG=en_US.UTF-8 npx vitest run tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/architecture/dev-deployment-register.test.ts > "$OUT/p2-c1.log" 2>&1
echo "C1 rc=$?"

echo "=== C2 ==="
LANG=en_US.UTF-8 npx vitest run tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts > "$OUT/p2-c2.log" 2>&1
echo "C2 rc=$?"

echo "=== C3 (gained tests/architecture/register-support-publication.test.ts) ==="
LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts > "$OUT/p2-c3.log" 2>&1
echo "C3 rc=$?"

echo "=== C4 ==="
LANG=en_US.UTF-8 npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts > "$OUT/p2-c4.log" 2>&1
echo "C4 rc=$?"

echo "=== register-support-publication.test.ts ALONE (F-ARCH-4 / BASELINE 15 vs 12/14) ==="
LANG=en_US.UTF-8 npx vitest run tests/architecture/register-support-publication.test.ts > "$OUT/p2-rsp-alone.log" 2>&1
echo "RSP rc=$?"

echo "=== done ==="; date '+%Y-%m-%d %H:%M:%S %Z'
