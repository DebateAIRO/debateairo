#!/bin/zsh
# REV-S03-p1-correctness-tests — run the pass-1 probe fixture inside ANY slice worktree.
# WRITTEN AGAINST HEAD: cc014550. 21 assertions; expected `Tests 21 passed (21)`.
#
# The fixture imports by paths relative to `tests/unit/`, so it is copied INTO the worktree,
# run, and removed again; the worktree is left byte-clean.
#
# Usage:  WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S03-p1-correctness-tests-run-probe.sh
#     or: zsh REV-S03-p1-correctness-tests-run-probe.sh /abs/path/to/<wt>/dialectical-engine
set -u
W="${WORKTREE:-${1:-}}"
[ -n "$W" ] || { echo "WORKTREE=<abs worktree dialectical-engine dir> required (or argv 1)" >&2; exit 2; }
case "$W" in /*) ;; *) echo "WORKTREE must be absolute (got: $W)" >&2; exit 2;; esac
cd "$W" || exit 2

SRC="$(cd "$(dirname "$0")" && pwd)/REV-S03-p1-correctness-tests-probe.test.ts"
[ -f "$SRC" ] || { echo "probe fixture missing beside this script: $SRC" >&2; exit 2; }
DEST="tests/unit/rev-s03-p1-correctness-tests-probe.test.ts"
[ -e "$DEST" ] && { echo "REFUSING: $DEST already exists in the worktree" >&2; exit 2; }

cp "$SRC" "$DEST"
trap 'rm -f "$W/$DEST"' EXIT
LANG=en_US.UTF-8 npx vitest run "$DEST"
rc=$?
rm -f "$DEST"
echo "porcelain after: $(git status --porcelain | wc -l | tr -d ' ') entries"
exit $rc
