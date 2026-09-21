#!/bin/zsh
# mutant.sh — REV-S01-p1-correctness-tests refutation harness.
# Written against slice head db4758da. Restores FROM the captured bytes, never to a literal.
#   usage: mutant.sh <LABEL> <REL_FILE> <OLD_LITERAL_FILE> <NEW_LITERAL_FILE> <suite:p:f> ...
# Root from $WORKTREE or argv-free default; never hard-coded into the probe body.
set -u
WT="${WORKTREE:?set WORKTREE=<abs path to the checkout root>}"
OUT="${MUTANT_OUT:?set MUTANT_OUT=<abs log dir>}"
RUNNER="${RUNNER:?set RUNNER=<abs path to run-suites.sh>}"
LABEL=$1; REL=$2; OLDF=$3; NEWF=$4; shift 4
cd "$WT" || exit 2
BAK="$OUT/$LABEL.captured"
cp "$REL" "$BAK" || exit 2
python3 - "$REL" "$OLDF" "$NEWF" <<'PY' || { cp "$BAK" "$REL"; echo "$LABEL MUTANT_NOT_APPLIED"; exit 3; }
import sys
rel,oldf,newf=sys.argv[1:4]
s=open(rel).read(); o=open(oldf).read(); n=open(newf).read()
if s.count(o)!=1:
    print("occurrences=",s.count(o)); sys.exit(1)
open(rel,"w").write(s.replace(o,n))
PY
LOG="$OUT/$LABEL.log" $RUNNER "$@" > "$OUT/$LABEL.summary" 2>&1
cp "$BAK" "$REL"
if [ -n "$(git status --porcelain)" ]; then echo "$LABEL RESTORE_FAILED"; git status --porcelain; exit 4; fi
echo "===== $LABEL ====="
cat "$OUT/$LABEL.summary"
echo "restored: clean"
