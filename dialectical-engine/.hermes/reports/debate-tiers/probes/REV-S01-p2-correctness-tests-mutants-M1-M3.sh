#!/bin/zsh
# REV-S01-p2-correctness-tests — mutant driver. Every mutant is applied, measured, and RESTORED
# byte-exactly (sha256 + git status --porcelain verified) before the next one.
set -u
W=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine
P=/private/tmp/debate-tiers-REV-S01-p2-correctness-tests
cd "$W" || exit 9

run_suite() {  # $1 = test file
  local out
  out=$(pnpm exec vitest run "$1" 2>&1)
  printf '%s\n' "$out" | grep -E '^ *(Tests|Test Files) ' | tr -s ' '
  printf '%s\n' "$out" | grep -E '^\s+(×|FAIL)' | sed 's/^ */    RED: /' | head -20
}

restore() {
  for f in apps/ui/app/new/page.tsx apps/ui/app/globals.css tests/render/tier01-new-plan-tier.test.tsx tests/unit/tier01-style-contract.test.ts; do
    cp "$P/backup/$(echo $f | tr '/' '_')" "$f"
  done
  local dirty; dirty=$(git status --porcelain | wc -l | tr -d ' ')
  echo "  restored: dirty=$dirty  $(shasum -a 256 apps/ui/app/new/page.tsx apps/ui/app/globals.css tests/render/tier01-new-plan-tier.test.tsx tests/unit/tier01-style-contract.test.ts | shasum -a 256 | cut -c1-16)"
}

echo "### BASELINE at 53b903d2 (no mutant)"
echo "-- tier01-new-plan-tier"; run_suite tests/render/tier01-new-plan-tier.test.tsx
echo "-- tier01-style-contract"; run_suite tests/unit/tier01-style-contract.test.ts
restore

echo
echo "### M1 — page.tsx REVERTED to f6c147cc (pre-FIX source, post-FIX tests)"
cp "$P/prefix/apps_ui_app_new_page.tsx" apps/ui/app/new/page.tsx
echo "-- tier01-new-plan-tier"; run_suite tests/render/tier01-new-plan-tier.test.tsx
restore

echo
echo "### M2 — globals.css REVERTED to f6c147cc (pre-FIX stylesheet, post-FIX tests)"
cp "$P/prefix/apps_ui_app_globals.css" apps/ui/app/globals.css
echo "-- tier01-style-contract"; run_suite tests/unit/tier01-style-contract.test.ts
restore

echo
echo "### M3 — tests REVERTED to f6c147cc (post-FIX source, pre-FIX tests)"
cp "$P/prefix/tests_render_tier01-new-plan-tier.test.tsx" tests/render/tier01-new-plan-tier.test.tsx
cp "$P/prefix/tests_unit_tier01-style-contract.test.ts" tests/unit/tier01-style-contract.test.ts
echo "-- OLD tier01-new-plan-tier vs NEW page"; run_suite tests/render/tier01-new-plan-tier.test.tsx
echo "-- OLD tier01-style-contract vs NEW globals"; run_suite tests/unit/tier01-style-contract.test.ts
restore
