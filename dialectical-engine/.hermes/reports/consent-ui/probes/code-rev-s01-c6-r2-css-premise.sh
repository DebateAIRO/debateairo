#!/bin/bash
# CODE-REV-S01-C6-r2 — re-measure the CSS facts the rewritten comment asserts.
# ASCII anchors only (COMMON 10.16). Run under /bin/bash.
set -u
LANE="$1"
CSS="$LANE/apps/ui/app/globals.css"
echo "css file: $CSS"
echo "css lines: $(wc -l < "$CSS")"
echo "--- 1. any .policy* RULE selector (line-scan, ASCII) ---"
n_policy=$(grep -cE '^[[:space:]]*\.policy[A-Za-z]*[[:space:]]*[,{]' "$CSS")
echo "n_policy_rule_lines=$n_policy"
grep -nE '^[[:space:]]*\.policy[A-Za-z]*[[:space:]]*[,{]' "$CSS" || echo "(none)"
echo "--- 1b. ANY occurrence of the string .policy anywhere in the stylesheet ---"
n_any=$(grep -cE '\.policy[A-Za-z]' "$CSS")
echo "n_any_dot_policy=$n_any"
grep -nE '\.policy[A-Za-z]' "$CSS" || echo "(none)"
echo "--- 2. --z-policy-* tokens: declared? consumed? ---"
echo "declarations:"
grep -nE '^[[:space:]]*--z-policy-[a-z]+[[:space:]]*:' "$CSS" || echo "(none)"
echo "var() consumption in globals.css:"
grep -nE 'var\(--z-policy-' "$CSS" || echo "(none)"
echo "var() consumption anywhere under apps/ui:"
grep -rnE 'var\(--z-policy-' "$LANE/apps/ui" || echo "(none)"
echo "--- 3. .consentScrim rule body ---"
ln=$(grep -nE '^[[:space:]]*\.consentScrim[[:space:]]*[,{]' "$CSS" | head -1 | cut -d: -f1)
echo "consentScrim rule starts at line: $ln"
if [ -n "$ln" ]; then sed -n "${ln},$((ln+12))p" "$CSS"; fi
echo "--- 4. sanity: the guard is satisfiable (known-GOOD input) ---"
tmp=$(mktemp)
printf '%s\n' '  .policyScrim {' '    position: fixed;' '  }' > "$tmp"
g=$(grep -cE '^[[:space:]]*\.policy[A-Za-z]*[[:space:]]*[,{]' "$tmp")
echo "known-GOOD synthetic file -> n_policy_rule_lines=$g (must be 1; proves the pattern is not unsatisfiable)"
rm -f "$tmp"
