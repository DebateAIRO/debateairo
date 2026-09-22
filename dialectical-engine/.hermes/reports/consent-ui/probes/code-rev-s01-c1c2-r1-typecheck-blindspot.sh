#!/bin/bash
# REVIEWER PROBE — CODE-REV-S01-C1C2 r1. Confirms COMMON §10.30's class by
# MEASUREMENT, in the failure direction: a real TS2322 in the cluster's own
# deliverable leaves CMD-C2 at verdict=0.
# Run from the lane root (the level holding package.json).
set -e
cp apps/ui/lib/consent.ts /tmp/consent.ts.orig
cat >> apps/ui/lib/consent.ts <<'MUT'

export function consentSummaryLabel(decision: ConsentDecision): string {
  return decision.quality;
}
MUT
echo "--- ARM 1: root pnpm typecheck (this IS the cluster's typecheck arm) ---"
tc=$(pnpm typecheck 2>&1); echo "exit=$?  diagnostics outside the pin = $(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')"
echo "--- ARM 2: compensating apps/ui project typecheck ---"
( cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | head -3 )
echo "--- ARM 3: full CMD-C2 verdict with the type error present ---"
/bin/bash "$(dirname "$0")/code-rev-s01-c1c2-r1-cmd-c2.sh" | tail -1
cp /tmp/consent.ts.orig apps/ui/lib/consent.ts
echo "restored: $(md5 -q apps/ui/lib/consent.ts)"
# MEASURED AT 87b50e1e: ARM1 = 0 outside pin (BLIND) | ARM2 = lib/consent.ts(202,3): error TS2322 (CAUGHT) | ARM3 = verdict=0 (PASSES WITH THE ERROR)
