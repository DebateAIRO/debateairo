#!/bin/bash
# CODE-REV-S02-C1C2 r2 — W2 discrimination proof: GREEN on the shipped module, RED on MN1c.
LANE="${1:?lane}"
cd "$LANE" || exit 99
MOD=apps/ui/components/consent/modalSemantics.ts
P=".review-scratch/advance-loop.probe.tsx"
runit() {
  out=$(pnpm exec vitest run --config .review-scratch/probe.vitest.config.ts "$P" 2>&1); ec=$?
  echo "  exit=$ec  $(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)"
  printf '%s\n' "$out" | grep -E '^[[:space:]]*(W2 |FAIL |AssertionError)' | head -4
}
echo "=== A. SHIPPED module (06ab1da4) ==="; runit
echo "=== B. MUTANT MN1c — advance loop removed ==="
python3 - "$MOD" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text()
old = ("  for (let attempt = 0; attempt < focusable.length; attempt += 1) {\n"
       "    cursor = (cursor + step + focusable.length) % focusable.length;\n"
       "    const next = focusable[cursor]!;\n"
       "    focusElement(next);\n"
       "    if (document.activeElement === next) return;\n"
       "  }")
new = ("  cursor = (cursor + step + focusable.length) % focusable.length;\n"
       "  focusElement(focusable[cursor]!);")
assert old in s, "anchor missing"
p.write_text(s.replace(old,new,1)); print("  mutant applied")
PY
runit
git checkout HEAD -- "$MOD"
echo "  restored; porcelain for module = [$(git status --porcelain -- "$MOD")]"
