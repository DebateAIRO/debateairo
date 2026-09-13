#!/bin/sh
# REQ-REV-S03 probe 1 — every product line SPEC(S03) cites, printed FROM THE LANE at its own HEAD.
# Read-only. No stack, no provider, no git writes.
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
p() { printf '\n===== %s [%s] =====\n' "$2" "$1"; sed -n "$3p" "$L/$1"; }
p packages/providers/src/index.ts "R11 normalizedProviderBaseUrl 109-132" 109,132
p packages/providers/src/index.ts "R10 gateway 333-338" 333,338
p packages/providers/src/index.ts "R14 parse targets 134-137" 134,137
p apps/api/src/provider-discovery.ts "R13 probe 54-80" 54,80
p apps/api/src/provider-discovery.ts "R14 mismatch 119-124" 119,124
p apps/runner/src/dev-provider-panel.ts "R11/R9 85-101" 85,101
p apps/runner/src/main.ts "R14 first slot 65-71" 65,71
p apps/runner/src/dev-cli-provider-panel.ts "R18 alias+prefix 99-128" 99,128
p apps/runner/src/dev-api-environment.ts "R25 guard 352-374" 352,374
p apps/ui/app/new/page.tsx "R16 roster import/use 8-12 + 196-212" "8,12"
p apps/ui/app/new/page.tsx "R16 render 196,212" 196,212
p apps/ui/lib/models.ts "R17 modelKey 24-37" 24,37
p acceptance/hermes-relay.ts "R12/R26 custody 15-18 + 33-40" 15,18
p acceptance/hermes-relay.ts "R12 custody asserts 33,40" 33,40
p acceptance/model-shim.ts "R3 codex -c model 165-169" 165,169
p packages/contract/src/plan-tiers.ts "R8 PLAN_TIER_ROSTERS 1-14" 1,14
