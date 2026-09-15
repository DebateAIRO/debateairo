#!/bin/sh
# ARCH-REV-S01 probe 1 — static criteria the PLAN's steps make a stranger check.
# Read-only. Run from the S01 lane.
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
cd "$LANE" || exit 1
echo "lane HEAD: $(git rev-parse --short HEAD)  dirty: $(git status --porcelain | wc -l | tr -d ' ')"
echo

echo "=== S01-24 done-criterion: grep -c 'useEffect' apps/ui/app/new/page.tsx (PLAN says 1) ==="
grep -c 'useEffect' apps/ui/app/new/page.tsx
echo "--- the lines it counts ---"
grep -n 'useEffect' apps/ui/app/new/page.tsx
echo

echo "=== S01-35 done-criterion: grep -c 'previous\\|snapshot\\|remembered' apps/ui/app/new/page.tsx (PLAN says 0) ==="
grep -c 'previous\|snapshot\|remembered' apps/ui/app/new/page.tsx
echo "--- matching lines ---"
grep -n 'previous\|snapshot\|remembered' apps/ui/app/new/page.tsx
echo "--- does BSD grep here treat \\| as alternation? control: grep -c 'zzz\\|useState' ---"
grep -c 'zzz\|useState' apps/ui/app/new/page.tsx
echo

echo "=== F2: the v2ui-pages:83 empty region, re-measured ==="
node -e '
const fs=require("fs");
const p=fs.readFileSync("apps/ui/app/new/page.tsx","utf8");
const a=p.indexOf("async function submit"), b=p.indexOf("return (");
const line=(i)=>p.slice(0,i).split("\n").length;
console.log("indexOf(async function submit) =",a,"line",line(a));
console.log("indexOf(return () =",b,"line",line(b));
console.log("slice(a,b).length =",p.slice(a,b).length);
'
echo "--- v2ui-pages.test.ts:26-36 (the region() helper) and :79-96 ---"
sed -n '26,36p;79,96p' tests/unit/v2ui-pages.test.ts
echo

echo "=== F3: globals.css markers and the .ndKeyHint insertion point ==="
wc -l apps/ui/app/globals.css
grep -n 'consent-ui S01\|end consent-ui S01\|consent-ui S02\|end consent-ui S02' apps/ui/app/globals.css
echo "--- :root and chamber blocks (COMMON token contract) ---"
grep -n '^:root {\|^html\[data-mode="chamber"\] {' apps/ui/app/globals.css
echo "--- what is actually at globals.css:6203-6212 (PLAN says .ndKeyHint at :6206) ---"
sed -n '6198,6215p' apps/ui/app/globals.css
echo "--- the :disabled rules in globals.css (PLAN says exactly one, .ndStart:disabled at :6193) ---"
grep -n ':disabled' apps/ui/app/globals.css
echo

echo "=== consent guards, verbatim at the lines the PLAN cites ==="
sed -n '244,252p' tests/unit/consent-s02-style-contract.test.ts
echo "---"
sed -n '258,282p' tests/render/consent-bar.test.tsx
echo

echo "=== t9-mode-tokens structure (PLAN cites maps :42-154, :156-268, :270-314, inventory case :412-418) ==="
wc -l tests/unit/t9-mode-tokens.test.ts
grep -n 'const TERRACOTTA\|const CHAMBER\|const MODE_INDEPENDENT\|^});\|  it(\|rootNames' tests/unit/t9-mode-tokens.test.ts | head -40
echo

echo "=== R11 quoted-exact discriminator, re-run (PLAN S01-1 claims bare finds 1 file for two ids, quoted-exact finds 0 for all five) ==="
for id in gpt-5.6-luna claude-sonnet-5 gpt-5.6-sol claude-opus-5 grok-4.6; do
  bare=$(grep -rl --include='*.ts' --include='*.tsx' --exclude='*.test.*' "$id" apps packages 2>/dev/null | grep -v node_modules | grep -v 'packages/contract/generated' | wc -l | tr -d ' ')
  q=$(grep -rl --include='*.ts' --include='*.tsx' --exclude='*.test.*' "\"$id\"" apps packages 2>/dev/null | grep -v node_modules | grep -v 'packages/contract/generated' | wc -l | tr -d ' ')
  echo "$id  bare=$bare quoted=$q"
  grep -rn --include='*.ts' --include='*.tsx' --exclude='*.test.*' "$id" apps packages 2>/dev/null | grep -v node_modules | grep -v 'packages/contract/generated' | sed 's/^/    /'
done
echo

echo "=== R20-A: the 13 ask literals, checked at the lines PLAN S01-8 names ==="
for spec in "tests/unit/api.test.ts:135" "tests/unit/api.test.ts:157" "tests/unit/api.test.ts:239" "tests/unit/api.test.ts:271" "tests/unit/api.test.ts:337" "tests/unit/api.test.ts:429" "tests/unit/api.test.ts:501" "tests/unit/load01-live-proof.test.ts:23" "tests/unit/s7-authorization.test.ts:79" "tests/unit/contract.test.ts:71" "tests/unit/contract.test.ts:83" "tests/unit/contract.test.ts:90" "tests/integration/evaluator-database.test.ts:1330"; do
  f=${spec%%:*}; l=${spec##*:}
  printf '%s:%s  ' "$f" "$l"; sed -n "${l}p" "$f"
done
echo "--- total steering_annotations occurrences per file (the sweep reproduction R20 names) ---"
grep -rc steering_annotations apps packages tests 2>/dev/null | grep -v ':0$'
echo

echo "=== S01-22 / R1 anchor: ndTopicBezel and the page region the SPEC cites (page.tsx:160-177) ==="
grep -n 'ndTopicBezel\|ndIntro\|ndOptionsToggle\|id="topic"' apps/ui/app/new/page.tsx
echo

echo "=== the fourteen ids R4 names, as rendered today ==="
grep -n 'id={`\|id="' apps/ui/app/new/page.tsx | head -40
echo "=== SegmentedRow / SelectRow / SliderRow definitions ==="
grep -n 'function SegmentedRow\|function SelectRow\|function SliderRow' apps/ui/app/new/page.tsx
echo "=== the OPTIONS knobs' fields ==="
grep -n 'field="' apps/ui/app/new/page.tsx
echo
echo "dirty after: $(git status --porcelain | wc -l | tr -d ' ')"
