#!/bin/sh
# REQ-REV-S03 pass 3 probe — the measurements SPEC-v3 breaks the Build A/B tie on, and R31's "forced shape".
# Read-only, in the LANE at 9a000c37. No stack, no provider, no git writes.
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
p() { printf '\n===== %s [%s] =====\n' "$2" "$1"; sed -n "$3p" "$L/$1"; }
p apps/runner/src/dev-api-environment.ts "TIE-BREAKER: isExactProviderRuntimeRefresh 300-335" 300,335
p apps/runner/src/dev-provider-panel.ts   "R31's forced shape 96,126" 96,126
p apps/api/src/provider-discovery.ts      "R33: probes every configured target 125,145" 125,145
p apps/api/src/provider-discovery.ts      "R33: auth only when present 40,50" 40,50
p packages/providers/src/index.ts         "authorization_header optional 165,180" 165,180
