#!/bin/zsh
# WHOLE-REV-grok-4.6 mutants. Header: written against head f85cbe80.
# Restores FROM the copies captured at the start of this script, never to a literal.
set -eu
ROOT="${WORKTREE:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/whole-rev-grok/dialectical-engine}"
OUT="/private/tmp/debate-tiers-WHOLE-REV-grok-4.6"
cd "$ROOT"
HEAD=$(git rev-parse --short HEAD)
echo "MUTANT-PROBE head=$HEAD captured=$(date '+%F %T')"

PAGE="apps/ui/app/new/page.tsx"
API="apps/api/src/index.ts"
cp "$PAGE" "$OUT/page.tsx.orig"
cp "$API" "$OUT/index.ts.orig"

restore() {
  cp "$OUT/page.tsx.orig" "$PAGE"
  cp "$OUT/index.ts.orig" "$API"
  cmp -s "$OUT/page.tsx.orig" "$PAGE"
  cmp -s "$OUT/index.ts.orig" "$API"
  echo "restore cmp page=$(cmp -s "$OUT/page.tsx.orig" "$PAGE" && echo equal) api=$(cmp -s "$OUT/index.ts.orig" "$API" && echo equal)"
  git status --porcelain -- "$PAGE" "$API"
}

# Mutant A: drop native disabled on the risk-tier pills (S01 R4 / step 5).
python3 - <<'PY'
from pathlib import Path
p = Path("apps/ui/app/new/page.tsx")
text = p.read_text()
old = '''            <SegmentedRow
              field="riskTier"
              label="Risk tier"
              hint={planTier === "free"
                ? "How much is riding on the answer · fixed by the Free plan"
                : "How much is riding on the answer · explicit asker selection"}
              options={RISK_TIER_OPTIONS}
              value={riskTier}
              disabled={planTier === "free"}
              onChange={(value) => {
                setRiskTier(value);
                setRiskTierWasEdited(true);
              }}
            />'''
new = old.replace("              disabled={planTier === \"free\"}\n", "")
if old not in text:
    raise SystemExit("mutant A: risk SegmentedRow block not found")
p.write_text(text.replace(old, new, 1))
PY
echo "MUTANT-A applied (risk pills lose native disabled)"
set +e
pnpm exec vitest run tests/render/WHOLE-REV-grok-4.6-s01-ac.test.tsx > "$OUT/mutant-A.log" 2>&1
A_RC=$?
set -e
echo "MUTANT-A rc=$A_RC (expect non-zero: probe must catch the missing native lock)"
/usr/bin/grep -E 'FAIL |Tests ' "$OUT/mutant-A.log" | tail -20
restore

# Mutant B: roster-missing check AFTER assertMakerAdmission (S02 R6 order).
python3 - <<'PY'
from pathlib import Path
p = Path("apps/api/src/index.ts")
text = p.read_text()
block = '''  const missing = roster.filter((modelId) =>
    !filteredPanel.some((member) => member.model_id === modelId)
  );
  if (missing.length > 0) {
    markAskRefusal(new TypedDomainError(
      "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      `The ${ask.plan_tier} plan needs ${missing.join(", ")}, and ${
        missing.length === 1 ? "it is" : "they are"
      } not available right now`
    ));
  }
  const makers = Object.freeze([...new Set(filteredPanel.map((member) => member.maker))]);
  const makerAvailability = Object.freeze({
    deploymentMakerCapability: makers.length > 0,
    runMakerReachability: makers.length >= 2,
    classification: makers.length >= 2 ? "CAPABLE" as const : "TRANSIENT_OUTAGE" as const,
    configuredMakers: makers,
    reachedMakers: makers,
    registerRef: filteredPanel.map((member) => member.probe_evidence_ref).join(",") || "provider_probe:empty"
  });
  try {
    assertMakerAdmission(risk.effectiveRiskTier, makerAvailability);
  } catch (error) {
    markAskRefusal(error);
  }
'''
moved = '''  const makers = Object.freeze([...new Set(filteredPanel.map((member) => member.maker))]);
  const makerAvailability = Object.freeze({
    deploymentMakerCapability: makers.length > 0,
    runMakerReachability: makers.length >= 2,
    classification: makers.length >= 2 ? "CAPABLE" as const : "TRANSIENT_OUTAGE" as const,
    configuredMakers: makers,
    reachedMakers: makers,
    registerRef: filteredPanel.map((member) => member.probe_evidence_ref).join(",") || "provider_probe:empty"
  });
  try {
    assertMakerAdmission(risk.effectiveRiskTier, makerAvailability);
  } catch (error) {
    markAskRefusal(error);
  }
  const missing = roster.filter((modelId) =>
    !filteredPanel.some((member) => member.model_id === modelId)
  );
  if (missing.length > 0) {
    markAskRefusal(new TypedDomainError(
      "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      `The ${ask.plan_tier} plan needs ${missing.join(", ")}, and ${
        missing.length === 1 ? "it is" : "they are"
      } not available right now`
    ));
  }
'''
if block not in text:
    raise SystemExit("mutant B: admission block not found")
p.write_text(text.replace(block, moved, 1))
PY
echo "MUTANT-B applied (roster check after assertMakerAdmission)"
set +e
pnpm exec vitest run tests/unit/WHOLE-REV-grok-4.6-s02-admission.test.ts > "$OUT/mutant-B.log" 2>&1
B_RC=$?
set -e
echo "MUTANT-B rc=$B_RC (expect non-zero: empty free panel must not stay ASK_PLAN_TIER_MODEL_UNAVAILABLE-only)"
/usr/bin/grep -E 'FAIL |Tests |MAKER_INVENTORY' "$OUT/mutant-B.log" | tail -30
restore

echo "MUTANT-PROBE done A_rc=$A_RC B_rc=$B_RC dirty_paths=$(git status --porcelain -- apps/ui/app/new/page.tsx apps/api/src/index.ts | wc -l | tr -d ' ')"
