#!/bin/sh
# ARCH-REV-S01 probe 5 — the reviewer's INDEPENDENT sweep of ARCH's own F4 class:
# which STANDING suites READ each file S01 WRITES? ARCH swept three files
# (apps/ui/lib/api.ts, apps/ui/app/globals.css, packages/contract/src/index.ts).
# S01's production write surface is SIX files (PLAN.md:640-642). This sweeps all six.
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
cd "$LANE" || exit 1
echo "lane HEAD: $(git rev-parse --short HEAD)  dirty: $(git status --porcelain | wc -l | tr -d ' ')"
echo

# the suites the PLAN already runs in some cluster command, or names in §7
KNOWN="tests/unit/contract.test.ts tests/unit/api.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/integration/evaluator-database.test.ts tests/architecture/s7-authorization-contract.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/v2ui-data-layer.test.ts tests/unit/pol01-policy.test.ts tests/architecture/s14-contract.test.ts tests/render/prov01-honesty-drawer.test.tsx tests/render/bug02-debate-effects.test.tsx tests/render/evaluator-dev-menu-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/v2ui-ownership.test.ts tests/unit/v2ui-pages.test.ts tests/render/ux01-new-debate-form.test.tsx tests/render/sup-04-widget.test.tsx tests/architecture/sup-04-mounts.test.ts tests/unit/evaluator-dev-menu-ui.test.ts tests/unit/t9-mode-tokens.test.ts tests/render/consent-bar.test.tsx tests/render/consent-card.test.tsx tests/render/consent-cross-slice.test.tsx tests/render/consent-guards.test.tsx tests/render/consent-policy-link.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/t3-library.test.tsx tests/architecture/role-token-map.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx"

known() { for k in $KNOWN; do [ "$k" = "$1" ] && return 0; done; return 1; }

sweep() {
  target=$1; shift
  echo "=== READERS of $target ==="
  hits=$(grep -rlE "$*" tests acceptance 2>/dev/null | sort -u)
  for h in $hits; do
    case "$h" in *.test.ts|*.test.tsx) ;; *) continue;; esac
    if known "$h"; then echo "    [in the plan] $h"; else echo "    *** NOT IN ANY CLUSTER COMMAND OR §7 ROW: $h"; fi
  done
  echo
}

sweep "apps/ui/app/new/page.tsx"      'app/new/page|new/page\.js|ndTopicBezel|ndScreen|NewDebatePage'
sweep "apps/ui/app/new/defaults.tsx"  'new/defaults|buildNewDebateAskConfig|deriveSessionAskDefaults|deriveRiskTierDefault|NewDebateAskDefaults|steeringLines|PROVISIONAL_COMPOSITION_BUDGET_DEFAULT|DECISION_SCOPE_DEFAULT'
sweep "apps/ui/lib/api.ts"            'lib/api|@/lib/api|createDebate|contractClient'
sweep "packages/contract/src/index.ts" 'AskRequestSchema|@debateai/contract|contractInventory'
sweep "apps/ui/app/globals.css"       'globals\.css'
sweep "packages/contract/src/plan-tiers.ts (new file — nothing can read it yet)" 'PLAN_TIER_ROSTERS|PlanTierSchema|plan_tier'

echo "=== the acceptance/ tree (F4 says it swept tests/ AND acceptance/) ==="
ls acceptance 2>/dev/null | head
echo
echo "dirty after: $(git status --porcelain | wc -l | tr -d ' ')"
