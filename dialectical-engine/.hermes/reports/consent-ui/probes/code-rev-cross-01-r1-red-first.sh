#!/bin/bash
# CODE-REV-CROSS-01 r1 — RED-first replay: HEAD's TESTS against the BASE's PRODUCT.
# Snapshot/restore with cp + diff -q, NEVER `git checkout --` (COMMON §10.44).
LANE="${1:?usage: red-first.sh <lane> <snapdir>}"
SNAP="${2:?usage: red-first.sh <lane> <snapdir>}"
BASE=2127c4ad
cd "$LANE" || exit 2
P=(apps/ui/components/consent/modalSemantics.ts
   apps/ui/components/consent/CookieBar.tsx
   apps/ui/components/consent/CookieConsent.tsx
   apps/ui/components/consent/CookiePreferencesCard.tsx)

echo "=== reverting PRODUCT ONLY to $BASE (tests stay at HEAD) ==="
for f in "${P[@]}"; do
  git show "$BASE:./$f" > "$f" || exit 3
done
echo "changed files now:"; git status --porcelain

echo
echo "=== consent-modal-semantics.test.tsx against BASE product ==="
pnpm exec vitest run tests/render/consent-modal-semantics.test.tsx 2>&1 \
  | grep -E "^ (✓|×|❯)|Tests |Test Files |named control|RETURNED bar|captured opener" | head -40
echo
echo "=== consent-policy-link.test.tsx against BASE product ==="
pnpm exec vitest run tests/render/consent-policy-link.test.tsx 2>&1 \
  | grep -E "^ (✓|×|❯)|Tests |Test Files " | head -40

echo
echo "=== RESTORING from snapshot ==="
for f in "${P[@]}"; do cp "$SNAP/$(basename "$f")" "$f"; done
for f in "${P[@]}"; do diff -q "$f" "$SNAP/$(basename "$f")" >/dev/null && echo "restored-identical: $f" || echo "RESTORE FAILED: $f"; done
echo "tree after restore: $(git status --porcelain | wc -l) entries"
