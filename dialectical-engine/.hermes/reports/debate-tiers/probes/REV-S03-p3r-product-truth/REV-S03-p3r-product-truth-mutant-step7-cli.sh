#!/usr/bin/env bash
# REV-S03-p3r-product-truth — wrapper for the step-7 probe.
# capture -> mutate config/models.yaml with step 7's own example fault -> run the probe
# -> restore FROM the captured bytes -> cmp. Root from $WORKTREE or argv, never hard-coded.
set -u
ROOT="${1:-${WORKTREE:-}}"
if [ -z "$ROOT" ]; then echo "usage: $0 <worktree-root>"; exit 2; fi
cd "$ROOT" || exit 2
CAP="$(mktemp -d)"
trap 'cp "$CAP/models.yaml" "$ROOT/config/models.yaml" 2>/dev/null; cp "$CAP"/generated/*.ts "$ROOT/packages/contract/generated/" 2>/dev/null; rm -rf "$CAP"' EXIT

cp config/models.yaml "$CAP/models.yaml" || exit 2
mkdir -p "$CAP/generated"
cp packages/contract/generated/*.ts "$CAP/generated/" || exit 2

python3 - <<'PY'
p = "config/models.yaml"
s = open(p, encoding="utf-8").read()
assert "  - api: openai\n" in s, "MUTANT_ANCHOR_NOT_FOUND"
open(p, "w", encoding="utf-8").write(s.replace("  - api: openai\n", "  - api: acme\n", 1))
print("MUTATED: `api: acme` on the first Free entry")
PY
[ $? -ne 0 ] && { echo "MUTANT_ABORTED"; exit 2; }

LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p3r-product-truth-step7.test.ts 2>&1 \
  | grep -E '\[PROBE p3r step7\]|Test Files|Tests  |✓|×|FAIL'

cp "$CAP/models.yaml" config/models.yaml
cp "$CAP"/generated/*.ts packages/contract/generated/
cmp -s "$CAP/models.yaml" config/models.yaml && echo "RESTORED models.yaml: cmp equal" || echo "RESTORED models.yaml: DIFFERS"
RD=0
for f in "$CAP"/generated/*.ts; do
  cmp -s "$f" "packages/contract/generated/$(basename "$f")" || RD=1
done
[ "$RD" -eq 0 ] && echo "RESTORED generated/: cmp equal" || echo "RESTORED generated/: DIFFERS"
