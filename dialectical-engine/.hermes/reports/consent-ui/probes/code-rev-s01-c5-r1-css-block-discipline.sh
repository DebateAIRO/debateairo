#!/bin/bash
# Accounts for EVERY changed line of globals.css in 9dd8042e..d5e217f7 and proves
# each falls inside (a) the :root token block or (b) the delimited S01 block.
cd "${1:-${LANE:-$PWD}}" || exit 99
CSS=apps/ui/app/globals.css
echo "S01 delimiters:      $(grep -c '=== consent-ui S01 ===' $CSS) marker line(s) -> $(grep -n '=== consent-ui S01 ===' $CSS | tr '\n' ' ')"
ROOT_END=$(grep -n '^html\[data-mode="chamber"\] {' $CSS | head -1 | cut -d: -f1)
S01_START=$(grep -n '=== consent-ui S01 ===' $CSS | head -1 | cut -d: -f1)
echo "chamber block starts at :$ROOT_END ; S01 block starts at :$S01_START"
# Every ADDED/REMOVED line, with its NEW-file line number, via git diff -U0
git diff -U0 9dd8042e..d5e217f7 -- $CSS \
  | awk -v re="$ROOT_END" -v s01="$S01_START" '
    /^@@/ { split($3,a,","); ln=a[1]; sub(/^\+/,"",ln); next }
    /^\+\+\+|^---/ { next }
    /^\+/ { zone = (ln+0 < re+0) ? "ROOT-TOKEN-BLOCK" : ((ln+0 >= s01+0) ? "S01-BLOCK" : "!!!OUTSIDE!!!"); printf "+ %5d %-18s %s\n", ln, zone, substr($0,2); add++; ln++; next }
    /^-/  { printf "- %5s %-18s %s\n", "", "(removed)", substr($0,2); del++; next }
    END { printf "\nADDED=%d REMOVED=%d TOTAL=%d\n", add, del, add+del }'
