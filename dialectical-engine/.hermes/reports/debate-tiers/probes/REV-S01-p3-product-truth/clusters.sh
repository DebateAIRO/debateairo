#!/bin/zsh
# REV(S01) p3 product-truth — re-run the four cluster commands myself at the head under review.
# Worktree from $WORKTREE (never hard-coded — pass-2 N5), runner from $REPO.
set -u
W="${WORKTREE:?set WORKTREE=<abs path to the lane holding package.json>}"
REPO="${REPO:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine}"
OUT="${OUT:-/private/tmp/debate-tiers-REV-S01-p3-product-truth}"
RUNNER="$REPO/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
cd "$W" || exit 2

C1=(tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 \
    tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 \
    tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 \
    tests/architecture/s8-publication-contract.test.ts:4:1)
C2=(tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 \
    tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 \
    tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 \
    tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0)
C3=(tests/render/tier01-new-plan-tier.test.tsx:22:0 tests/unit/v2ui-pages.test.ts:36:5 \
    tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 \
    tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0)
C4=(tests/unit/tier01-style-contract.test.ts:8:0 tests/unit/t9-mode-tokens.test.ts:7:2 \
    tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 \
    tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 \
    tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 \
    tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 \
    tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2)

RUN="${1:-1}"
echo "=== REV-S01-p3-product-truth cluster re-run #$RUN  HEAD=$(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ')  $(date '+%F %T %Z')"
for n in 1 2 3 4; do
  case $n in
    1) SUITES=("${C1[@]}");; 2) SUITES=("${C2[@]}");; 3) SUITES=("${C3[@]}");; 4) SUITES=("${C4[@]}");;
  esac
  echo "== S01-C$n (${#SUITES[@]} pairs) run $RUN =="
  LOG="$OUT/p3-C$n-run$RUN.log" zsh "$RUNNER" "${SUITES[@]}" | tail -3
  echo "S01-C$n run$RUN rc=$?"
done
echo "=== done $(date '+%F %T %Z')"
