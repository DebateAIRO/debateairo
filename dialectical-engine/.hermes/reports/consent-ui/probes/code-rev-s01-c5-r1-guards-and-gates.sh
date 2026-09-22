#!/bin/bash
# CODE-REV-S01-C5 r1 — the standing gates and the S01-S45 guard class, run under
# /bin/bash (BSD grep, C locale) so §10.16's shell hazard cannot hide a 0.
LANE="${1:-${LANE:-$PWD}}"; cd "$LANE" || exit 99
echo "shell=/bin/bash  grep=$(grep --version 2>&1 | head -1)  locale=${LC_ALL:-C}"
echo
echo "=== S01-S45 guard class over apps/ui/components/consent/ (FIXED strings, -F) ==="
for pat in 'addEventListener' 'Escape' '.focus()' 'document.' '<script' 'createPortal' 'localStorage' 'sessionStorage' 'gtag' 'analytics.'; do
  n=$(grep -rFc "$pat" --include='*.tsx' --include='*.ts' apps/ui/components/consent/ | awk -F: '{s+=$2} END {print s+0}')
  printf '  %-18s total hits: %s\n' "$pat" "$n"
done
echo
echo "=== colour literals in every file this slice added under apps/ui (C7's class, pre-flight) ==="
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|hsla?\(' --include='*.tsx' --include='*.ts' apps/ui/components/consent/ apps/ui/lib/consent.ts || echo "  0 hits"
echo
echo "=== the S01 delimited CSS block: colour literals outside var(--token) ==="
awk '/=== consent-ui S01 ===/{f=1} /=== end consent-ui S01 ===/{f=0} f' apps/ui/app/globals.css \
  | grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(|hsla?\(' | grep -v 'cubic-bezier' || echo "  0 hits"
echo
echo "=== standing gates ==="
a=$(pnpm exec vitest run tests/render/auth-flow-integration.test.tsx 2>&1); printf '  auth-flow-integration      %s\n' "$(printf '%s\n' "$a" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1 | tr -s ' ')"
for f in tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/evaluator-dev-menu-ui.test.ts; do
  o=$(pnpm exec vitest run "$f" 2>&1)
  printf '  %-46s %s\n' "$(basename "$f")" "$(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1 | tr -s ' ')"
done
