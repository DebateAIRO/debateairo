#!/bin/bash
# PROMOTED MUTANT PROBE — seat REV-S02-p2-product-truth, mission debate-tiers.
# WRITTEN AGAINST slice head 88f8a01f (slice/tiers-s02, after FIX(S02) p1 F3+F1+F2).
# A mutant's direction can invert between heads: what this script REPORTS is what it produces
# where you run it, never what this header predicted. At 88f8a01f it produced:
#   M2b  SURVIVES  (C2 Test Files 3 passed (3) / Tests 58 passed (58))
#   MDUP SURVIVES  (C3 Test Files 1 failed | 1 passed (2) / Tests 3 failed | 6 passed (9) — the
#                   three s14-contract failures only, i.e. the roster guard stayed green)
# Both mutants are RESTORED FROM THE BYTES CAPTURED AT RUN TIME, never to a literal.
#
# usage: WORKTREE=<root> ./REV-S02-p2-product-truth--mutant-message-and-declaration.sh
#    or: ./REV-S02-p2-product-truth--mutant-message-and-declaration.sh <root>
set -u
WORKTREE="${WORKTREE:-${1:-$PWD}}"
cd "$WORKTREE" || { echo "no worktree at $WORKTREE"; exit 2; }
TMP="$(mktemp -d)"
echo "PROBE REV-S02-p2-product-truth message+declaration · root $WORKTREE · head $(git rev-parse --short HEAD) · dirty $(git status --porcelain | wc -l | tr -d ' ')"

run_mutant() {  # name file python-source cluster-files...
  local name="$1" file="$2" py="$3"; shift 3
  cp "$file" "$TMP/$name.orig"
  local before; before=$(shasum -a 256 "$file" | awk '{print $1}')
  printf '%s' "$py" > "$TMP/$name.py"
  python3 "$TMP/$name.py" "$WORKTREE/$file" || { cp "$TMP/$name.orig" "$file"; echo "$name MUTATOR FAILED"; return 1; }
  pnpm exec vitest run "$@" > "$TMP/$name.log" 2>&1
  echo "--- $name rc=$? ---"
  grep -E '^ *(Test Files|Tests) ' "$TMP/$name.log" | tail -2
  grep -E '^ *FAIL ' "$TMP/$name.log" | sort -u
  cp "$TMP/$name.orig" "$file"
  local after; after=$(shasum -a 256 "$file" | awk '{print $1}')
  [ "$before" = "$after" ] && echo "$name restore byte-equal: YES" || echo "$name restore byte-equal: NO"
  echo "$name git status --porcelain: $(git status --porcelain | wc -l | tr -d ' ') entries"
}

# M2b — the TIER NAME is dropped only for the single-missing-member shape (today's Premium).
# The missing model id is still named, so the honesty law's core still holds; SPEC-v2 R7's
# "the text contains the tier name" does not.
run_mutant M2b apps/api/src/index.ts 'import sys
p=sys.argv[1]; s=open(p).read()
old="`The ${ask.plan_tier} plan needs ${missing.join(\", \")}, and ${"
new="`The ${missing.length === 1 ? \"\" : ask.plan_tier} plan needs ${missing.join(\", \")}, and ${"
assert old in s, "anchor not found"
open(p,"w").write(s.replace(old,new,1))
' tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts

# MDUP — a SECOND declaration of both rosters inside the canonical file itself. The pass-1 guard
# pinned each model id to plan-tiers.ts:9 / :10 and saw two lines; the file-set guard sees one file.
run_mutant MDUP packages/contract/src/plan-tiers.ts 'import sys
p=sys.argv[1]; s=open(p).read()
old="export const PLAN_TIER_ROSTERS = Object.freeze({"
new="""export const LEGACY_FREE_MODELS = Object.freeze([\"gpt-5.6-luna\", \"claude-sonnet-5\"]);
export const LEGACY_PREMIUM_MODELS = Object.freeze([\"gpt-5.6-sol\", \"claude-opus-5\", \"grok-4.6\"]);

export const PLAN_TIER_ROSTERS = Object.freeze({"""
assert old in s, "anchor not found"
open(p,"w").write(s.replace(old,new,1))
' tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts

echo "dirty at the end: $(git status --porcelain | wc -l | tr -d ' ')"
rm -rf "$TMP"
