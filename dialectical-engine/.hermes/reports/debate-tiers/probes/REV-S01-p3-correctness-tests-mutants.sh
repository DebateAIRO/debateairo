#!/bin/zsh
# REV-S01-p3-correctness-tests — mutation matrix over the pass-3 diff.
# Every mutant is applied, measured, and restored byte-exactly (sha256 verified).
# Root from $WORKTREE or argv, never hard-coded (pass-2 N5).
set -u
ROOT="${WORKTREE:-${1:-}}"
[ -n "$ROOT" ] || { echo "usage: WORKTREE=<abs path to dir holding package.json> $0"; exit 2; }
cd "$ROOT" || exit 2
OUT="${OUTDIR:-/private/tmp/debate-tiers-REV-S01-p3-correctness-tests}"; mkdir -p "$OUT"
PAGE=apps/ui/app/new/page.tsx
CSS=apps/ui/app/globals.css
RENDER=tests/render/tier01-new-plan-tier.test.tsx
STYLE=tests/unit/tier01-style-contract.test.ts
MODELS=apps/ui/lib/models.ts

sha() { shasum -a 256 "$1" | cut -c1-16; }
BASE_PAGE=$(sha $PAGE); BASE_CSS=$(sha $CSS); BASE_MODELS=$(sha $MODELS)

run() { # run <label> <suite>
  o=$(pnpm exec vitest run "$2" 2>&1)
  echo "$o" > "$OUT/mut-$1-$(basename $2).log"
  s=$(printf '%s\n' "$o" | /usr/bin/grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  echo "   $2 -> ${s:-NO SUMMARY}"
  printf '%s\n' "$o" | /usr/bin/grep -E '^\s+×' | sed 's/^/      RED: /' | sed 's/[0-9]*ms$//'
}
restore() { git checkout -- "$1" 2>/dev/null || true; }

echo "== BASELINE (no mutant) =="
run baseline $RENDER; run baseline $STYLE

echo ""
echo "== M1 · SelectRow loses native disabled (the pass-2 B1 defect, re-injected) =="
perl -0pi -e 's/          value=\{value\}\n          disabled=\{disabled\}/          value={value}\n          aria-disabled={disabled}/' $PAGE
grep -c 'aria-disabled' $PAGE | sed 's/^/   aria-disabled occurrences: /'
run m1 $RENDER
restore $PAGE; [ "$(sha $PAGE)" = "$BASE_PAGE" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== M2 · the new .ndSelect select:disabled rule deleted (product-p2 N1's remedy) =="
perl -0pi -e 's/\.ndSelect select:disabled \{ cursor: not-allowed; \}\n//' $CSS
run m2 $STYLE
restore $CSS; [ "$(sha $CSS)" = "$BASE_CSS" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== M3 · branchingWidth gains step={2} — off-grid (correctness-p2 N2's class: all four grids) =="
perl -0pi -e 's/(id="branchingWidth"\n                label="Branching width"\n                hint="Pro \+ con children per claim"\n                min=\{1\}\n                max=\{4\}\n)/${1}                step={2}\n/' $PAGE
grep -c 'step={2}' $PAGE | sed 's/^/   step={2} occurrences: /'
run m3 $RENDER
restore $PAGE; [ "$(sha $PAGE)" = "$BASE_PAGE" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== M4 · only the REAL id claude-sonnet-5 misclassifies (isolates correctness-p2 N3's class:"
echo "        this mutant is INVISIBLE to the six alternate ids the pass-2 test used) =="
perl -0pi -e 's/  if \(lower\.includes\("claude"\)\) return "claude";/  if (lower.includes("sonnet")) return "default";\n  if (lower.includes("claude")) return "claude";/' $MODELS
grep -c 'sonnet' $MODELS | sed 's/^/   sonnet arm inserted: /'
run m4 $RENDER
restore $MODELS; [ "$(sha $MODELS)" = "$BASE_MODELS" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== M5 · one locked control loses aria-describedby (S01-28's description arm) =="
perl -0pi -e 's/                  aria-describedby="steeringPresets-hint"\n//' $PAGE
run m5 $RENDER
restore $PAGE; [ "$(sha $PAGE)" = "$BASE_PAGE" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== M6 (REVERSE MUTANT) · the deleted handler guards RESTORED — can any official suite see them? =="
perl -0pi -e 's/          onChange=\{\(event\) => onChange\(Number\(event\.target\.value\)\)\}/          onChange={(event) => { if (disabled) return; onChange(Number(event.target.value)); }}/' $PAGE
perl -0pi -e 's/          onChange=\{\(event\) => onChange\(event\.target\.value\)\}/          onChange={(event) => { if (disabled) return; onChange(event.target.value); }}/' $PAGE
grep -c 'if (disabled) return' $PAGE | sed 's/^/   guards re-inserted: /'
run m6 $RENDER; run m6 $STYLE
echo "   -- and MY probe under the same mutant --"
cp "$OUT/rev-p3-probe.test.tsx" tests/render/zz-rev-p3-probe.test.tsx
run m6 tests/render/zz-rev-p3-probe.test.tsx
rm -f tests/render/zz-rev-p3-probe.test.tsx
restore $PAGE; [ "$(sha $PAGE)" = "$BASE_PAGE" ] && echo "   restored OK" || echo "   RESTORE FAILED"

echo ""
echo "== FINAL byte-check =="
echo "page=$([ "$(sha $PAGE)" = "$BASE_PAGE" ] && echo CLEAN || echo DIRTY) css=$([ "$(sha $CSS)" = "$BASE_CSS" ] && echo CLEAN || echo DIRTY) models=$([ "$(sha $MODELS)" = "$BASE_MODELS" ] && echo CLEAN || echo DIRTY)"
echo "git status --short: [$(git status --short | tr '\n' ' ')]"
echo "MUTANTS_DONE $(date '+%F %T')"
