#!/bin/zsh
# REV-S02-p2-correctness-tests — run both promoted fixtures in ANY worktree.
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S02-p2-correctness-tests-run.sh
#   zsh REV-S02-p2-correctness-tests-run.sh /abs/path/to/<wt>/dialectical-engine
# The root is never hard-coded. Each fixture is COPIED in, run, and REMOVED; if the target
# path already existed it is saved first and put back byte-for-byte (restore FROM the state
# captured at the start of this run, never to a literal).
#
# HEAD THIS WAS WRITTEN AGAINST: 88f8a01f (slice/tiers-s02 after FIX(S02) p1 F3+F1+F2).
# MEASURED THERE: boundary 7 passed (7) rc=0 · half-applied 6 passed (6) rc=0.
# Neither fixture touches a live database: half-applied starts two embedded Postgres
# instances on OS-assigned ports and stops them.
set -u
ROOT="${WORKTREE:-${1:-}}"
if [[ -z "$ROOT" || ! -d "$ROOT/tests" ]]; then
  print -u2 "usage: WORKTREE=<abs path to …/dialectical-engine> zsh $0   (or pass it as argv[1])"
  exit 2
fi
HERE="${0:a:h}"
A="$ROOT/tests/unit/REV-S02-p2-correctness-tests-boundary.test.ts"
B="$ROOT/tests/integration/REV-S02-p2-correctness-tests-half-applied-0061.test.ts"
SAVEDIR="$(mktemp -d "${TMPDIR:-/tmp}/revs02p2corr.XXXXXX")"
for T in "$A" "$B"; do [[ -e "$T" ]] && cp "$T" "$SAVEDIR/$(basename $T)"; done
restore() {
  for T in "$A" "$B"; do
    if [[ -e "$SAVEDIR/$(basename $T)" ]]; then cp "$SAVEDIR/$(basename $T)" "$T"; else rm -f "$T"; fi
  done
  ( cd "$ROOT" && print "restored · git status --porcelain lines: $(git status --porcelain | wc -l | tr -d ' ')" )
}
trap restore EXIT INT TERM
cp "$HERE/REV-S02-p2-correctness-tests-boundary.test.ts" "$A" || exit 1
cp "$HERE/REV-S02-p2-correctness-tests-half-applied-0061.test.ts" "$B" || exit 1
cd "$ROOT" || exit 1
print "== A: the invalid-tier boundary, the HTTP face and R4/R6/R7 =="
pnpm exec vitest run "tests/unit/REV-S02-p2-correctness-tests-boundary.test.ts"
rcA=$?
print "== B: the two half-applied 0061 schema states, both write paths =="
pnpm exec vitest run "tests/integration/REV-S02-p2-correctness-tests-half-applied-0061.test.ts"
rcB=$?
print "rcA=$rcA rcB=$rcB"
exit $(( rcA != 0 || rcB != 0 ))
