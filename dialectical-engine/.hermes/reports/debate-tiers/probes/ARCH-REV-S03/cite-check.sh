#!/bin/zsh
# ARCH-REV-S03 — every load-bearing line citation in PLAN.md, read back from the lane at 9a000c37.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
cd "$LANE" || exit 99
show() { echo "--- $1 :: $2 ---"; sed -n "$2p" "$1"; }

echo "############ dev-api-environment.ts ############"
show apps/runner/src/dev-api-environment.ts 310,318
show apps/runner/src/dev-api-environment.ts 336,342
show apps/runner/src/dev-api-environment.ts 352,374
show apps/runner/src/dev-api-environment.ts 489,497
show apps/runner/src/dev-api-environment.ts 265,272
echo "grep chain call sites:"; grep -n 'isExactProviderRuntimeRefresh\|isExactPublishedRegisterRefresh\|acceptPreviousSource' apps/runner/src/dev-api-environment.ts

echo "############ provider-discovery.ts ############"
show apps/api/src/provider-discovery.ts 16,31
show apps/api/src/provider-discovery.ts 44,62
show apps/api/src/provider-discovery.ts 75,80
show apps/api/src/provider-discovery.ts 104,145

echo "############ packages/providers/src/index.ts ############"
show packages/providers/src/index.ts 100,140
show packages/providers/src/index.ts 155,182
show packages/providers/src/index.ts 330,340

echo "############ dev-provider-panel.ts ############"
show apps/runner/src/dev-provider-panel.ts 1,12
show apps/runner/src/dev-provider-panel.ts 25,60
show apps/runner/src/dev-provider-panel.ts 79,130
show apps/runner/src/dev-provider-panel.ts 135,170

echo "############ main.ts (runner) ############"
show apps/runner/src/main.ts 60,75
show apps/runner/src/main.ts 203,215

echo "############ dev-auth-stack.ts ############"
grep -n 'checkModelConfig\|isPublicPortOccupied\|startProviderPanel\|startSupportModelRelay\|startHermesSupportRelay\|startDataPlane\|provisionHatchetToken\|assembleApiEnvironment\|assembleDevelopmentApiEnvironment' apps/runner/src/dev-auth-stack.ts
show apps/runner/src/dev-auth-stack.ts 52,58

echo "############ dev-cli-provider-panel.ts ############"
show apps/runner/src/dev-cli-provider-panel.ts 95,150

echo "############ dev-deployment-register.ts ############"
show apps/runner/src/dev-deployment-register.ts 315,330
show apps/runner/src/dev-deployment-register.ts 504,512

echo "############ apps/api/src/index.ts admission ############"
show apps/api/src/index.ts 1205,1260
echo "deployment route:"; grep -n "v1/deployment" apps/api/src/index.ts | head

echo "############ contract + ui ############"
show packages/contract/src/client.ts 503,508
show packages/contract/src/generate.ts 1,5
show packages/contract/src/index.ts 1,6
show packages/contract/src/plan-tiers.ts 1,20
show apps/ui/app/new/defaults.tsx 24,30
show apps/ui/app/new/page.tsx 8,12
show apps/ui/app/new/page.tsx 196,212
echo "generate:contract in root package.json:"; grep -n 'generate:contract' package.json
echo ".gitignore generated:"; grep -n 'generated' .gitignore

echo "############ test oracles ############"
show tests/architecture/tier01-roster.test.ts 1,55
echo "--- tiers-s02-rosters key lines ---"
sed -n '1,12p;45,90p;118,135p;200,250p' tests/architecture/tiers-s02-rosters.test.ts

echo "############ dev-real-provider-only.test.ts ############"
wc -l tests/architecture/dev-real-provider-only.test.ts
grep -n 'development:\|hermes-glm\|startHermesSupportRelay' tests/architecture/dev-real-provider-only.test.ts

echo "############ hermes-relay.ts ############"
wc -l acceptance/hermes-relay.ts
grep -n 'HERMES_SUPPORT_PORT\|HERMES_GLM_MODEL\|HERMES_SUPPORT_PROVIDER_REF\|readGlmCredential\|nlink\|0o600\|0o700' acceptance/hermes-relay.ts

echo "############ dev-api-environment.test.ts pin ############"
show tests/integration/dev-api-environment.test.ts 348,366
grep -c 'it(' tests/integration/dev-api-environment.test.ts

echo "############ migrations ############"
show migrations/0022_dr181_discovery.sql 1,14
grep -n 'failure_code' migrations/0048_provider_probe_capability.sql | head

echo "############ call sites of the panel builder ############"
grep -rn 'buildDevelopmentProviderPanel\|parseDevelopmentProviderPanelTargets\|developmentConfiguredProviderPanel\|loadDevelopmentProviderPanelFromEnvironment' apps packages tests coverage 2>/dev/null | grep -v node_modules

echo "############ done ############"
