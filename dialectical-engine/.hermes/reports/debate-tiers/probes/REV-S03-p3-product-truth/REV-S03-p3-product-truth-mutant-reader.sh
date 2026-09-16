#!/bin/bash
# REV-S03-p3-product-truth — MUTANT probe. Head written against: 3f488b3f
# (integration/all carrying slice head 0fe14637 = cd043907 + FIX-S03-p2-F1).
#
# Question: does my pass-3 joining probe actually DETECT the defect it claims to clear,
# or is it green for some unrelated reason? Reverting FIX-S03-p2-F1's reader-side
# projection to the pass-2 form must turn it RED.
#
# Restore discipline: this script captures the file's CURRENT bytes into a temp copy and
# restores FROM that capture, never to a literal (the pass-2 lesson: a `disabled=false`
# revert to a literal unlocked the whole page at a later head).
#
# Root: $WORKTREE, or argv[1]. Never hard-coded.
set -euo pipefail
ROOT="${1:-${WORKTREE:-}}"
if [ -z "$ROOT" ]; then echo "usage: WORKTREE=<worktree>/dialectical-engine $0  (or pass it as argv[1])" >&2; exit 2; fi
cd "$ROOT"

TARGET="apps/api/src/index.ts"
CAPTURE="$(mktemp -t rev-s03-p3-mutant-capture)"
cp "$TARGET" "$CAPTURE"
restore() { cp "$CAPTURE" "$TARGET"; cmp -s "$CAPTURE" "$TARGET" && echo "RESTORED: cmp equal"; rm -f "$CAPTURE"; }
trap restore EXIT

echo "=== BASELINE (fix present) ==="
LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p3-product-truth-wire.test.ts tests/render/REV-S03-p3-product-truth-page.test.tsx 2>&1 | grep -E 'Test Files|  Tests ' || true

echo "=== MUTANT: revert the reader-side projection to the pass-2 whole-row parse ==="
python3 - "$TARGET" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
fixed = '''    const value = row?.value as Readonly<{
      free?: unknown;
      premium?: unknown;
    }> | null | undefined;
    return PlanTierRostersSchema.parse({
      free: value?.free,
      premium: value?.premium
    });'''
mutant = '''    return PlanTierRostersSchema.parse(row?.value);'''
assert s.count(fixed) == 1, f"expected exactly 1 occurrence, found {s.count(fixed)}"
p.write_text(s.replace(fixed, mutant))
print("mutant applied")
PY

LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p3-product-truth-wire.test.ts tests/render/REV-S03-p3-product-truth-page.test.tsx 2>&1 | grep -E 'Test Files|  Tests |FAIL ' || true
echo "=== restoring ==="
