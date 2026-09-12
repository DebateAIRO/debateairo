#!/bin/zsh
# REV-S02-p2-correctness-tests — MUTANT probe, two cells, for the R2 architecture guard.
#
# HEAD THIS WAS WRITTEN AGAINST: 88f8a01f (slice/tiers-s02 after FIX(S02) p1 F3 e8a7ad1a).
# It RESTORES FROM THE STATE IT CAPTURED at the start of this run — never to a literal — so
# it is safe at a later head, but the cell outcomes below are only asserted at 88f8a01f.
#
# Question: after F3 rewrote tests/architecture/tiers-s02-rosters.test.ts, does the R2 guard
# ("keeps plan-tier model selection out of if and case branches") still fire when the branch
# body selects a roster through a LOCAL ALIAS instead of naming PLAN_TIER_ROSTERS itself?
# The rewritten predicate requires the token PLAN_TIER_ROSTERS inside the selected body
# (tests/architecture/tiers-s02-rosters.test.ts:156, :162).
#
#   M20 = a multi-line `if` on the tier assigning a pre-bound alias   -> measured GREEN (missed)
#   M21 = a ONE-LINE ternary on the tier choosing between two aliases -> measured GREEN (missed);
#         the pass-1 line-local guard at 9ef275aa CAUGHT this same shape (measured).
#
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh <this script>
#   zsh <this script> /abs/path/to/<wt>/dialectical-engine
set -u
ROOT="${WORKTREE:-${1:-}}"
if [[ -z "$ROOT" || ! -d "$ROOT/tests" ]]; then
  print -u2 "usage: WORKTREE=<abs path to …/dialectical-engine> zsh $0   (or pass it as argv[1])"
  exit 2
fi
API="$ROOT/apps/api/src/index.ts"
SAVE="$(mktemp -d "${TMPDIR:-/tmp}/revs02p2-r2-mutant.XXXXXX")"
cp "$API" "$SAVE/index.ts" || exit 1
restore() {
  cp "$SAVE/index.ts" "$API"
  print "restored from the captured state: $SAVE"
  ( cd "$ROOT" && git status --porcelain )
}
trap restore EXIT INT TERM
cd "$ROOT" || exit 1

apply() {
python3 - "$API" "$1" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); mode = sys.argv[2]
s = p.read_text(encoding="utf8")
anchor = "  const discoveredPanel = await settings.resolveDiscoveredPanel();\n"
assert s.count(anchor) == 1, f"anchor count {s.count(anchor)} — the file moved; do not trust this mutant"
if mode == "M20":
    body = ("  const freeAlias = PLAN_TIER_ROSTERS.free;\n"
            "  const premiumAlias = PLAN_TIER_ROSTERS.premium;\n"
            "  let aliasRoster: readonly string[] = premiumAlias;\n"
            "  if (ask.plan_tier === \"free\") {\n"
            "    aliasRoster = freeAlias;\n"
            "  }\n"
            "  void aliasRoster;\n")
else:
    body = ("  const freeAlias2 = PLAN_TIER_ROSTERS.free;\n"
            "  const premiumAlias2 = PLAN_TIER_ROSTERS.premium;\n"
            "  const aliasRoster2 = ask.plan_tier === \"free\" ? freeAlias2 : premiumAlias2;\n"
            "  void aliasRoster2;\n")
p.write_text(s.replace(anchor, anchor + body), encoding="utf8")
print(f"MUTANT {mode} applied")
PY
}

for M in M20 M21; do
  cp "$SAVE/index.ts" "$API"
  apply "$M" || exit 1
  print "== CELL $M =="
  pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts
  print "cell $M rc=$?   (measured at 88f8a01f: rc=0, Tests 4 passed (4) -> the guard MISSES this shape)"
done
