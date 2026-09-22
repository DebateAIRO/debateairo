#!/bin/bash
# CODE-REV-S01-C6-r2 — mutant matrix. Lane from argv (COMMON 10.35). ASCII anchors only.
set -u
LANE="$1"; shift
SRC="$LANE/apps/ui/components/consent/CookieConsent.tsx"
SNAP="$LANE/.review-scratch/CookieConsent.tsx.GREEN"
cd "$LANE" || exit 2
sum() { grep -E '^ +Tests +' "$1" | tail -1 | sed 's/^ *//'; }
for M in "$@"; do
  if [ "$M" != "NONE" ]; then
    python3 .review-scratch/mutate.py "$LANE" "$M" >/dev/null || { echo "$M PLANT FAILED"; continue; }
    if diff -q "$SNAP" "$SRC" >/dev/null; then echo "$M NO-OP MUTANT — ABORT"; continue; fi
  fi
  pnpm exec vitest run tests/render/consent-policy-link.test.tsx > .review-scratch/m-$M-author.log 2>&1
  a=$?
  pnpm exec vitest run --config .review-scratch/vitest.review.config.ts .review-scratch/probes/r2-route-class.test.tsx > .review-scratch/m-$M-r2.log 2>&1
  r=$?
  printf '%-5s author_exit=%d [%s]  |  r2_exit=%d [%s]\n' "$M" "$a" "$(sum .review-scratch/m-$M-author.log)" "$r" "$(sum .review-scratch/m-$M-r2.log)"
  grep -E '^ FAIL ' .review-scratch/m-$M-r2.log | sed 's/.*> /      r2 RED: /'
  cp "$SNAP" "$SRC"
  diff -q "$SNAP" "$SRC" >/dev/null && echo "      RESTORE OK (diff -q clean)" || echo "      RESTORE FAILED"
done
echo "porcelain (tracked): $(git status --porcelain -- apps tests packages | wc -l | tr -d ' ')"
