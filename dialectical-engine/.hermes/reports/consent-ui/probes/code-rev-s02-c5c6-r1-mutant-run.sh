#!/bin/bash
# usage: mutant-run.sh <lane> <label> <cluster C1|C5|C6> <file> <old> <new>
set -u
LANE="$1"; LABEL="$2"; CL="$3"; FILE="$4"; OLD="$5"; NEW="$6"
cd "$LANE" || exit 97
BEFORE=$(md5 -q "$FILE")
python3 .review-scratch/mutate.py "$FILE" "$OLD" "$NEW" >/dev/null || { echo "$LABEL | ANCHOR MISS — mutant NOT applied"; exit 4; }
LINE=$(/bin/bash .review-scratch/cluster-run.sh "$LANE" "$CL")
# restore
git checkout HEAD -- "$FILE"
AFTER=$(md5 -q "$FILE")
if [ "$BEFORE" != "$AFTER" ]; then echo "$LABEL | RESTORE FAILED"; exit 5; fi
PORC=$(git status --porcelain | grep -v '.review-scratch' | grep -cv 'zz-rev-')
V=$(printf '%s' "$LINE" | sed -n 's/.*VERDICT=\([0-9]\).*/\1/p')
if [ "$V" = "0" ]; then VERD="SURVIVED"; else VERD="CAUGHT"; fi
echo "$LABEL | $VERD | $LINE | restored=ok porcelain(excl scratch)=$PORC"
