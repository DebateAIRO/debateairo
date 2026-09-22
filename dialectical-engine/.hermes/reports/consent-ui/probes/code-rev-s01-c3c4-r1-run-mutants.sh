#!/bin/bash
# CODE-REV-S01-C3C4 r1 — plant each mutant, run the guards that should catch it,
# revert, and prove the tree is clean again. A mutant that leaves every guard
# green is a HOLE in the author's tests and is a finding.
S="$1"
cd "$2" || exit 1

run_vitest() {   # $1 = file ; echoes PASS/FAIL
  o=$(pnpm exec vitest run "$1" 2>&1)
  if [ $? -eq 0 ]; then echo "PASS"; else echo "FAIL"; fi
}
run_review() {
  o=$(pnpm exec vitest run --config .review-scratch/vitest.review.config.ts 2>&1)
  if [ $? -eq 0 ]; then echo "PASS"; else echo "FAIL"; fi
}
run_uitsc() {
  ( cd apps/ui && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1 )
  if [ $? -eq 0 ]; then echo "PASS"; else echo "FAIL"; fi
}
run_t9hits() {  # the CMD-C3/C4 colour-literal + block terms
  tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
  n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
  n_blocks=$(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)
  if [ "$n_hits" -eq 1 ] && [ "$n_blocks" -eq 1 ]; then echo "PASS(hits=$n_hits blocks=$n_blocks)"; else echo "FAIL(hits=$n_hits blocks=$n_blocks)"; fi
}

for m in "${@:3}"; do
  echo "===== MUTANT $m ====="
  python3 "$S/mutate.py" apply "$m" || { echo "  SKIPPED (anchor)"; continue; }
  case "$m" in
    C-ts7053)        echo "  apps/ui tsc      : $(run_uitsc)" ;;
    K-colour-literal|L-second-block)
                     echo "  author consent-bar: $(run_vitest tests/render/consent-bar.test.tsx)"
                     echo "  author consent-card: $(run_vitest tests/render/consent-card.test.tsx)"
                     echo "  CMD hit/block terms: $(run_t9hits)" ;;
    B-second-bottom|M-no-media-query)
                     echo "  author consent-bar: $(run_vitest tests/render/consent-bar.test.tsx)" ;;
    E-paraphrase-title|F-button-order|F2-button-order-tail|G-close-glyph)
                     echo "  author consent-bar: $(run_vitest tests/render/consent-bar.test.tsx)"
                     echo "  REVIEWER probe    : $(run_review)" ;;
    *)               echo "  author consent-card: $(run_vitest tests/render/consent-card.test.tsx)"
                     echo "  REVIEWER probe    : $(run_review)" ;;
  esac
  git checkout HEAD -- apps/ui/app/globals.css apps/ui/components/consent/CookieBar.tsx apps/ui/components/consent/CookiePreferencesCard.tsx
  echo "  reverted; tracked-dirty entries: $(git status --porcelain | grep -vc '^?? ')"
done
