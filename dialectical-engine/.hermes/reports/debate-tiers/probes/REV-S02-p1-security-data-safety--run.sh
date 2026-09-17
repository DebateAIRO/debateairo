#!/bin/zsh
# REV-S02-p1-security-data-safety — run both promoted probes in ANY worktree.
#   WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S02-p1-security-data-safety--run.sh
#   zsh REV-S02-p1-security-data-safety--run.sh /abs/path/to/<wt>/dialectical-engine
# The root is never hard-coded. Probe-b starts an embedded Postgres per run; it
# touches no live database and no port the mission's no-touch list names.
set -u
ROOT="${WORKTREE:-${1:-}}"
if [[ -z "$ROOT" || ! -d "$ROOT/tests" ]]; then
  print -u2 "usage: WORKTREE=<abs path to …/dialectical-engine> zsh $0   (or pass it as argv[1])"
  exit 2
fi
HERE="${0:a:h}"
A="$ROOT/tests/unit/REV-S02-p1-security-data-safety--probe-a-http-shapes.test.ts"
B="$ROOT/tests/integration/REV-S02-p1-security-data-safety--probe-b-db-paths.test.ts"
cleanup() { rm -f "$A" "$B"; }
trap cleanup EXIT INT TERM
cp "$HERE/REV-S02-p1-security-data-safety--probe-a-http-shapes.test.ts" "$A" || exit 1
cp "$HERE/REV-S02-p1-security-data-safety--probe-b-db-paths.test.ts" "$B" || exit 1
cd "$ROOT" || exit 1
print "== probe A (HTTP shapes, refusal typing, R8 with a mock pool) =="
pnpm exec vitest run "tests/unit/REV-S02-p1-security-data-safety--probe-a-http-shapes.test.ts"
rcA=$?
print "== probe B (both write paths, V-19 duplicate, R8 against a real database) =="
pnpm exec vitest run "tests/integration/REV-S02-p1-security-data-safety--probe-b-db-paths.test.ts"
rcB=$?
print "rcA=$rcA rcB=$rcB"
# Probe A is EXPECTED to end rc=1 on the shape-matrix case only if the harness
# changes; at 9ef275aa both probes end rc=0 with 4/4 and 5/5.
exit $(( rcA != 0 || rcB != 0 ))
