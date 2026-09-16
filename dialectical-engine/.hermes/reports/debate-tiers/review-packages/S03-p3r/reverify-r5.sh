#!/bin/zsh
# verify-r5.sh <expected lane sha> — the orchestrator's re-verification of FIX-S03-p3-F1 RULING 5 in the LANE: the product-truth lens's
# promoted step7 + step7sweep fixtures copied TEMPORARILY into tests/unit/ (removed after; porcelain must return to 0), the unit suite that
# pins the stage order, and the C3 nine-suite cluster once. Logs beside this script: r5-step7.log r5-unit.log r5-c3.log.
set -u
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; L=$M/.worktrees/tiers-s03/dialectical-engine; A=$M/.worktrees/all/dialectical-engine
S=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad
SHA=${1:?lane sha}; cd $L || exit 9
[ "$(git rev-parse --short HEAD)" = "$SHA" ] || { echo "lane HEAD is $(git rev-parse --short HEAD), not $SHA"; exit 8; }
[ -z "$(git status --porcelain)" ] || { echo "lane dirty before verification"; git status --porcelain | head; exit 7; }
P=$A/.hermes/reports/debate-tiers/probes/REV-S03-p3r-product-truth
cp $P/REV-S03-p3r-product-truth-step7.test.ts tests/unit/ && cp $P/REV-S03-p3r-product-truth-step7sweep.test.ts tests/unit/
echo "=== 1. the lens's step7 (3) + step7sweep (5) fixtures at $SHA (RED at a25c0d99 by the lens's measurement; GREEN expected now)"
LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p3r-product-truth-step7.test.ts tests/unit/REV-S03-p3r-product-truth-step7sweep.test.ts > $S/r5-step7.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests " $S/r5-step7.log | tail -2; grep -E '^\s*×' $S/r5-step7.log | sed -E 's/ [0-9]+ms$//' | cut -c1-160
rm -f tests/unit/REV-S03-p3r-product-truth-step7.test.ts tests/unit/REV-S03-p3r-product-truth-step7sweep.test.ts
echo "porcelain after the fixtures: $(git status --porcelain | wc -l | tr -d ' ') · committed models.yaml byte-identical: $(git diff --quiet HEAD -- config/models.yaml && echo yes || echo NO)"
echo "=== 2. tests/unit/dev-auth-stack.test.ts"
LANG=en_US.UTF-8 npx vitest run tests/unit/dev-auth-stack.test.ts > $S/r5-unit.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests " $S/r5-unit.log | tail -2
echo "=== 3. the C3 nine-suite cluster once (expected: the two inherited register-support-publication titles only)"
LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts > $S/r5-c3.log 2>&1; echo "rc=$?"; grep -E "Test Files|Tests " $S/r5-c3.log | tail -2; grep -E '^\s*×' $S/r5-c3.log | sed -E 's/ [0-9]+ms$//' | cut -c1-140
echo "=== 4. the stage order in source"; grep -n "DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED\|DEV_AUTH_STACK_MODEL_CONFIG_INVALID\|DEV_AUTH_STACK_PREFLIGHT_FAILED\|DEV_AUTH_STACK_DATA_FAILED" apps/runner/src/dev-auth-stack.ts | head -6
echo "=== 5. guards"; git diff 0fe14637 $SHA --stat -- apps/runner/src/dev-api-environment.ts packages/db | tail -1; echo "(guards end)"; echo "porcelain: $(git status --porcelain | wc -l | tr -d ' ')"
