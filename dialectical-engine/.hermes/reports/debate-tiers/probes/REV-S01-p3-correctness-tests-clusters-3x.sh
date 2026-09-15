#!/bin/zsh
# REV-S01-p3-correctness-tests — my OWN re-run of all four cluster commands, three runs each.
# Root from $WORKTREE or argv, never hard-coded (pass-2 N5).
set -u
ROOT="${WORKTREE:-${1:-}}"
[ -n "$ROOT" ] || { echo "usage: WORKTREE=<abs path to dir holding package.json> $0"; exit 2; }
cd "$ROOT" || exit 2
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
OUT="${OUTDIR:-/private/tmp/debate-tiers-REV-S01-p3-correctness-tests}"
mkdir -p "$OUT"

echo "REV-S01-p3 clusters 3x  root=$ROOT  HEAD=$(git rev-parse --short HEAD)  dirty=$(git status --short | wc -l | tr -d ' ')  $(date '+%F %T')"

C1=(tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 tests/architecture/s8-publication-contract.test.ts:4:1)
C2=(tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0)
C3=(tests/render/tier01-new-plan-tier.test.tsx:22:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0)
C4=(tests/unit/tier01-style-contract.test.ts:8:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2)

for run in 1 2 3; do
  echo "########## RUN $run  $(date '+%F %T') ##########"
  g=$(pnpm run generate:contract 2>&1); grc=$?
  echo "generate:contract rc=$grc dirty-after=$(git status --short | wc -l | tr -d ' ')"
  if [ $grc -ne 0 ]; then echo "S01-C1 BROKEN (generate:contract rc=$grc)"; else
    echo "== S01-C1 run $run =="; LOG="$OUT/c1-run$run.log" zsh "$RUNNER" "${C1[@]}"; echo "S01-C1 run$run rc=$?"
  fi
  echo "== S01-C2 run $run =="; LOG="$OUT/c2-run$run.log" zsh "$RUNNER" "${C2[@]}"; echo "S01-C2 run$run rc=$?"
  echo "== S01-C3 run $run =="; LOG="$OUT/c3-run$run.log" zsh "$RUNNER" "${C3[@]}"; echo "S01-C3 run$run rc=$?"
  echo "== S01-C4 run $run =="; LOG="$OUT/c4-run$run.log" zsh "$RUNNER" "${C4[@]}"; echo "S01-C4 run$run rc=$?"
done
echo "CLUSTERS_3X_DONE $(date '+%F %T') dirty=$(git status --short | wc -l | tr -d ' ')"
