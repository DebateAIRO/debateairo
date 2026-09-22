#!/bin/bash
# CODE-REV-S01-C6-r2 boundary + guard sweep. ASCII anchors only (COMMON 10.16/10.21).
set -u
LANE="$1"; cd "$LANE" || exit 2
echo "=== S01-S45 guard tokens in the TWO C6 files (comments included; a grep does not know what a comment is) ==="
for f in apps/ui/components/consent/CookieConsent.tsx apps/ui/components/consent/CookiePreferencesCard.tsx; do
  printf '%-58s addEventListener %s   .focus() %s   Escape %s\n' "$f" \
    "$(grep -c 'addEventListener' "$f")" "$(grep -c '\.focus()' "$f")" "$(grep -c 'Escape' "$f")"
done
echo "--- known-GOOD control: the file that SHOULD have them (S02's, excluded BY NAME) ---"
f=apps/ui/components/consent/PrivacyPolicyModal.tsx
printf '%-58s addEventListener %s\n' "$f" "$(grep -c 'addEventListener' "$f")"
grep -n 'addEventListener' "$f"
echo ""
echo "=== registration request shape untouched in the reviewed range ==="
n=$(git diff ab449cba..HEAD | grep -E '^[+-]' | grep -cE 'register\(|adult_affirmed')
echo "diff lines matching register\\(|adult_affirmed : $n  (must be 0)"
echo ""
echo "=== globals.css and the no-touch surface in the reviewed range ==="
echo "globals.css diff-stat:"; git diff --stat ab449cba..HEAD -- apps/ui/app/globals.css; echo "[empty = untouched]"
echo "packages/ apps/api/ migrations/ tools/ diff-stat:"; git diff --stat ab449cba..HEAD -- packages apps/api migrations tools apps/runner apps/scheduler; echo "[empty = untouched]"
echo "modalSemantics.ts (B2's file) diff-stat:"; git diff --stat ab449cba..HEAD -- apps/ui/components/consent/modalSemantics.ts; echo "[empty = untouched]"
echo ""
echo "=== S01 css block discipline ==="
echo "consent-ui S01 delimited blocks: $(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)"
echo "consent-ui S02 delimited blocks: $(grep -c '=== consent-ui S02 ===' apps/ui/app/globals.css)"
echo ""
echo "=== known-GOOD satisfiability control for the guard grep ==="
t=$(mktemp); printf 'x.addEventListener("scroll", f);\n' > "$t"
echo "synthetic file -> addEventListener count $(grep -c 'addEventListener' "$t") (must be 1)"; rm -f "$t"
