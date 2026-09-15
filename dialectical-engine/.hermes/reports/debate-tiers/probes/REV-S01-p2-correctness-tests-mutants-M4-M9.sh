#!/bin/zsh
set -u
W=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine
P=/private/tmp/debate-tiers-REV-S01-p2-correctness-tests
cd "$W" || exit 9

run_suite() {
  local out; out=$(pnpm exec vitest run "$1" 2>&1)
  printf '%s\n' "$out" | grep -E '^ *(Tests|Test Files) ' | tr -s ' '
  printf '%s\n' "$out" | grep -E '^\s+× ' | sed 's/^ */    RED: /' | head -8
  printf '%s\n' "$out" | grep -E 'AssertionError|Error: (Missing|Empty|Unclosed)' | sed 's/^ */    MSG: /' | head -4
}
restore() {
  for f in apps/ui/app/new/page.tsx apps/ui/app/globals.css tests/render/tier01-new-plan-tier.test.tsx tests/unit/tier01-style-contract.test.ts; do
    cp "$P/backup/$(echo $f | tr '/' '_')" "$f"; done
  echo "  restored: dirty=$(git status --porcelain | wc -l | tr -d ' ')"
}
edit() { # file, old, new
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p,o,n = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
assert s.count(o) >= 1, f"MUTANT ANCHOR NOT FOUND in {p}: {o!r}"
print(f"  mutated {p}: {s.count(o)} occurrence(s)")
open(p,'w').write(s.replace(o,n))
PY
}

echo "### M4 — B1/N2 ISOLATED: page.tsx step={32} -> step={128}"
edit apps/ui/app/new/page.tsx '                step={32}' '                step={128}'
run_suite tests/render/tier01-new-plan-tier.test.tsx
restore

echo; echo "### M5 — correctness N1 ISOLATED: globals.css --m-gpt: #B4552D -> #B4552E"
edit apps/ui/app/globals.css '--m-gpt: #B4552D;' '--m-gpt: #B4552E;'
echo "  [NEW style contract]"; run_suite tests/unit/tier01-style-contract.test.ts
cp "$P/prefix/tests_unit_tier01-style-contract.test.ts" tests/unit/tier01-style-contract.test.ts
echo "  [OLD (f6c147cc) style contract, same mutant]"; run_suite tests/unit/tier01-style-contract.test.ts
restore

echo; echo "### M6 — SEAM (c): delete the dead .ndSegItem:disabled... CSS block"
edit apps/ui/app/globals.css '.ndSegItem:disabled,
.ndSlider:disabled,
.ndSteerInput:disabled,
.ndSelect:has(select:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
' ''
echo "  [style contract]"; run_suite tests/unit/tier01-style-contract.test.ts
echo "  [render suite — does the PRODUCT notice?]"; run_suite tests/render/tier01-new-plan-tier.test.tsx
restore

echo; echo "### M7 — SEAM (c) other way: FREE_LOCK_STYLE opacity 0.45 -> 0.9"
edit apps/ui/app/new/page.tsx 'const FREE_LOCK_STYLE = { opacity: 0.45, cursor: "not-allowed" }' 'const FREE_LOCK_STYLE = { opacity: 0.9, cursor: "not-allowed" }'
echo "  [style contract — is it blind?]"; run_suite tests/unit/tier01-style-contract.test.ts
echo "  [render suite]"; run_suite tests/render/tier01-new-plan-tier.test.tsx
restore

echo; echo "### M8 — SEAM (d) ISOLATED: SliderRow hint loses its id"
edit apps/ui/app/new/page.tsx '        <div className="ndHint" id={`${id}-hint`}>{hint}</div>
      </div>
      <span className="ndSliderWrap">' '        <div className="ndHint">{hint}</div>
      </div>
      <span className="ndSliderWrap">'
run_suite tests/render/tier01-new-plan-tier.test.tsx
restore

echo; echo "### M9 — correctness N4 ISOLATED: empty the .ndTierModel CSS region"
edit apps/ui/app/globals.css '.ndTierModel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-3);
  white-space: nowrap;
}' '.ndTierModel {
}'
echo "  [NEW style contract]"; run_suite tests/unit/tier01-style-contract.test.ts
cp "$P/prefix/tests_unit_tier01-style-contract.test.ts" tests/unit/tier01-style-contract.test.ts
echo "  [OLD (f6c147cc) style contract, same mutant]"; run_suite tests/unit/tier01-style-contract.test.ts
restore
