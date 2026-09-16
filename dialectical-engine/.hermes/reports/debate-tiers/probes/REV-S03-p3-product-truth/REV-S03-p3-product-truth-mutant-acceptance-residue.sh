#!/bin/bash
# REV-S03-p3-product-truth — MUTANT probe, N2's price. Head written against: 3f488b3f.
#
# SPEC-v3 §2 acceptance steps 6, 8 (second half) and 10a tell V to EDIT config/models.yaml
# and never tell V to put it back (steps 7 and 9 do). This measures what the next seat
# inherits if V follows the steps literally and stops.
#
# Restore discipline: captures the file's CURRENT bytes and restores FROM that capture,
# never to a literal. Root: $WORKTREE, or argv[1]. Never hard-coded.
set -euo pipefail
ROOT="${1:-${WORKTREE:-}}"
if [ -z "$ROOT" ]; then echo "usage: WORKTREE=<worktree>/dialectical-engine $0" >&2; exit 2; fi
cd "$ROOT"

TARGET="config/models.yaml"
SUITES="tests/unit/model-config-file.test.ts tests/unit/model-config-tiers.test.ts tests/unit/model-config-shape.test.ts tests/architecture/model-config-no-secret.test.ts tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/render/tier01-new-plan-tier.test.tsx"

CAPTURE="$(mktemp -t rev-s03-p3-models-capture)"
cp "$TARGET" "$CAPTURE"
restore() { cp "$CAPTURE" "$TARGET"; cmp -s "$CAPTURE" "$TARGET" && echo "RESTORED: cmp equal"; rm -f "$CAPTURE"; }
trap restore EXIT

run() { LANG=en_US.UTF-8 npx vitest run $SUITES 2>&1 | grep -E '^ Test Files|^      Tests |^ FAIL ' || true; }

echo "=== A. BASELINE, file untouched ==="
run

echo
echo "=== B. STEP 6 applied (glm-5.3-flash -> glm-5.3), never restored by the step ==="
cp "$CAPTURE" "$TARGET"
python3 - "$TARGET" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
assert s.count("model: glm-5.3-flash") == 1
p.write_text(s.replace("model: glm-5.3-flash", "model: glm-5.3"))
PY
run

echo
echo "=== C. STEP 10a applied on top (grok-4.6-build added under free:), never restored ==="
python3 - "$TARGET" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1]); s = p.read_text()
lines = s.splitlines(keepends=True)
out, inserted = [], False
for i, line in enumerate(lines):
    out.append(line)
    if not inserted and line.startswith("free:"):
        # copy the indentation style of the first free entry that follows
        for probe in lines[i+1:]:
            if probe.strip().startswith("- "):
                indent = probe[:len(probe) - len(probe.lstrip())]
                out.append(f"{indent}- api: xai\n{indent}  model: grok-4.6-build\n")
                inserted = True
                break
assert inserted, "could not find the free: block"
p.write_text("".join(out))
PY
run
echo
echo "=== restoring ==="
