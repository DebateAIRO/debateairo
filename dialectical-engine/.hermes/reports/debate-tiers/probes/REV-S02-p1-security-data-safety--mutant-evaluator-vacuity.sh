#!/bin/zsh
# REV-S02-p1-security-data-safety — MUTANT probe, two cells.
#
# HEAD THIS WAS WRITTEN AGAINST: 9ef275aa (= slice/tiers-s02 head, REV(S02) pass 1).
# It RESTORES FROM THE STATE IT CAPTURED at the start of this run — never to a
# literal — so it is safe at a later head, but its EXPECTED cell outcomes below
# are only asserted at 9ef275aa. Re-read the outcomes before quoting them.
#
# Question: after C2, does tests/integration/evaluator-database.test.ts
# "FR-0.6 AC5 persisted panel-isolation differential" still refute an evaluator
# leak into the persisted panel?
#   Cell A = head + a simulated evaluator leak            -> measured PASS  (vacuous)
#   Cell B = same leak + S02's panel filter removed        -> measured FAIL  (sensitive)
#
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh <this script>
#   zsh <this script> /abs/path/to/<wt>/dialectical-engine
set -u
ROOT="${WORKTREE:-${1:-}}"
if [[ -z "$ROOT" || ! -d "$ROOT/tests" ]]; then
  print -u2 "usage: WORKTREE=<abs path to …/dialectical-engine> zsh $0   (or pass it as argv[1])"
  exit 2
fi
TEST="$ROOT/tests/integration/evaluator-database.test.ts"
API="$ROOT/apps/api/src/index.ts"
SAVE="$(mktemp -d "${TMPDIR:-/tmp}/revs02sec-mutant.XXXXXX")"
cp "$TEST" "$SAVE/evaluator-database.test.ts" || exit 1
cp "$API"  "$SAVE/index.ts"                   || exit 1
restore() {
  cp "$SAVE/evaluator-database.test.ts" "$TEST"
  cp "$SAVE/index.ts" "$API"
  print "restored from the captured state: $SAVE"
  ( cd "$ROOT" && git status --porcelain )
}
trap restore EXIT INT TERM
cd "$ROOT" || exit 1

python3 - "$TEST" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf8").read()
old = "          deploymentMakers.configuredProviders.map((provider) => provider.providerRef)\n"
new = "          [...deploymentMakers.configuredProviders.map((provider) => provider.providerRef), EVALUATOR_PROVIDER_REF]\n"
assert s.count(old) == 1, f"anchor count {s.count(old)} — the file moved; do not trust this mutant"
open(p, "w", encoding="utf8").write(s.replace(old, new))
print("MUTANT-LEAK applied")
PY

print "== CELL A: head (S02 filter present) + evaluator leak =="
pnpm exec vitest run tests/integration/evaluator-database.test.ts -t "persists byte-identical product membership"
print "cellA rc=$?   (measured at 9ef275aa: rc=0, Tests 1 passed | 20 skipped -> the assertion is VACUOUS)"

python3 - "$API" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf8").read()
old = "    discoveredPanel: filteredPanel,\n"
new = "    discoveredPanel,\n"
assert s.count(old) == 1, f"anchor count {s.count(old)} — the file moved; do not trust this mutant"
open(p, "w", encoding="utf8").write(s.replace(old, new))
print("MUTANT-NOFILTER applied (the pre-S02 return restored)")
PY

print "== CELL B: same leak + S02's panel filter removed from the return =="
pnpm exec vitest run tests/integration/evaluator-database.test.ts -t "persists byte-identical product membership"
print "cellB rc=$?   (measured at 9ef275aa: rc=1, 'expected true to be false' -> the assertion IS sensitive without the filter)"
