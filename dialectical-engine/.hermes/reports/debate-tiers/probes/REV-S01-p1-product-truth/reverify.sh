#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-product/dialectical-engine || exit 9
source /private/tmp/debate-tiers-REV-S01-p1-product-truth/run-suites-fn.sh
RUN=$1
echo "REV reverify run=$RUN $(date '+%Y-%m-%d %H:%M:%S') HEAD=$(git rev-parse --short HEAD) dirty=$(git status --short | wc -l | tr -d ' ')"
g=$(pnpm run generate:contract 2>&1); grc=$?
echo "generate:contract rc=$grc dirty-after=$(git status --short | wc -l | tr -d ' ')"
echo "== S01-C1 (8 pairs) =="
run_suites tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 tests/architecture/s8-publication-contract.test.ts:4:1
echo "S01-C1 rc=$?"
echo "== S01-C2 (9 pairs) =="
run_suites tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0
echo "S01-C2 rc=$?"
echo "== S01-C3 (6 pairs) =="
run_suites tests/render/tier01-new-plan-tier.test.tsx:21:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0
echo "S01-C3 rc=$?"
echo "== S01-C4 (11 pairs) =="
run_suites tests/unit/tier01-style-contract.test.ts:8:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2
echo "S01-C4 rc=$?"
echo "REV_REVERIFY_DONE run=$RUN $(date '+%Y-%m-%d %H:%M:%S') dirty=$(git status --short | wc -l | tr -d ' ')"
