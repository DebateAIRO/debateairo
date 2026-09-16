#!/usr/bin/env bash
# REV-S03-p3r-product-truth — MUTANT: does the V-49 generator stage actually make the RUN's
# roster follow config/models.yaml?
#
# Pass-3 N1: `/new`'s card came from the published register row (refreshed by dev:auth:up) while
# admission came from the COMMITTED generated constant (refreshed only by `pnpm generate:contract`),
# and dev:auth:up ran no generator — so after V edited the file the card moved and the run did not.
# V-49 put `generate:contract` in front of the seed. This mutant proves the second half: that the
# generator rewrites the constant FROM the file.
#
# Capture -> mutate (swap the two Free entries' order) -> generate -> observe -> restore -> cmp.
# Written against b97985a8. Restores FROM the bytes it captured, never to a literal.
# Root from $WORKTREE or argv, never hard-coded.
set -u
ROOT="${1:-${WORKTREE:-}}"
if [ -z "$ROOT" ]; then echo "usage: $0 <worktree-root>"; exit 2; fi
cd "$ROOT" || exit 2
CAP="$(mktemp -d)"
trap 'rm -rf "$CAP"' EXIT

cp config/models.yaml "$CAP/models.yaml" || exit 2
mkdir -p "$CAP/generated"
cp packages/contract/generated/*.ts "$CAP/generated/" || exit 2
echo "CAPTURED: $(ls "$CAP/generated" | tr '\n' ' ')"
echo "BEFORE: $(grep -m1 'free:' packages/contract/generated/plan-tier-rosters.ts)"

# MUTATE: swap the order of the two Free entries in the file V edits.
python3 - <<'PY'
import re
p = "config/models.yaml"
s = open(p, encoding="utf-8").read()
a = """  - api: openai
    model: gpt-5.6-luna
    base_url: https://api.openai.com/v1
    key: OPENAI_API_KEY
  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/coding/paas/v4
    key: ZAI_API_KEY
"""
b = """  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/coding/paas/v4
    key: ZAI_API_KEY
  - api: openai
    model: gpt-5.6-luna
    base_url: https://api.openai.com/v1
    key: OPENAI_API_KEY
"""
assert a in s, "MUTANT_ANCHOR_NOT_FOUND"
open(p, "w", encoding="utf-8").write(s.replace(a, b, 1))
print("MUTATED: the two Free entries are swapped in config/models.yaml")
PY
[ $? -ne 0 ] && { cp "$CAP/models.yaml" config/models.yaml; echo "MUTANT_ABORTED"; exit 2; }

pnpm generate:contract > "$CAP/generate.log" 2>&1
echo "generate:contract rc=$?"
echo "AFTER:  $(grep -m1 'free:' packages/contract/generated/plan-tier-rosters.ts)"

# RESTORE from the captured bytes.
cp "$CAP/models.yaml" config/models.yaml
cp "$CAP"/generated/*.ts packages/contract/generated/
if cmp -s "$CAP/models.yaml" config/models.yaml; then echo "RESTORED models.yaml: cmp equal"; else echo "RESTORED models.yaml: DIFFERS"; fi
RD=0
for f in "$CAP"/generated/*.ts; do
  cmp -s "$f" "packages/contract/generated/$(basename "$f")" || RD=1
done
[ "$RD" -eq 0 ] && echo "RESTORED generated/: cmp equal" || echo "RESTORED generated/: DIFFERS"
echo "FINAL: $(grep -m1 'free:' packages/contract/generated/plan-tier-rosters.ts)"
