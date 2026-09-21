#!/bin/zsh
set -u

WORKTREE=${WORKTREE:?set WORKTREE}
MUTANT_OUT=${MUTANT_OUT:?set MUTANT_OUT}
RUNNER=${RUNNER:?set RUNNER}
LABEL=$1
REL=$2
OLD_LITERAL=$3
NEW_LITERAL=$4
shift 4

cd "$WORKTREE" || exit 2
CAPTURE="$MUTANT_OUT/$LABEL.captured"
BEFORE_STATUS=$(git status --porcelain -- "$REL")
cp "$REL" "$CAPTURE" || exit 2
python3 - "$REL" "$OLD_LITERAL" "$NEW_LITERAL" <<'PY'
import sys
path, old_path, new_path = sys.argv[1:4]
with open(path) as source:
    text = source.read()
with open(old_path) as source:
    old = source.read()
with open(new_path) as source:
    new = source.read()
if text.count(old) != 1:
    print(f"occurrences={text.count(old)}")
    raise SystemExit(1)
with open(path, "w") as target:
    target.write(text.replace(old, new))
PY
PYTHON_STATUS=$?
if [[ $PYTHON_STATUS -ne 0 ]]; then
  cp "$CAPTURE" "$REL"
  echo "$LABEL MUTANT_NOT_APPLIED"
  exit 3
fi
LOG="$MUTANT_OUT/$LABEL.log" "$RUNNER" "$@" > "$MUTANT_OUT/$LABEL.summary" 2>&1
cp "$CAPTURE" "$REL"
cmp -s "$CAPTURE" "$REL" || {
  echo "$LABEL RESTORE_BYTES_FAILED"
  exit 4
}
AFTER_STATUS=$(git status --porcelain -- "$REL")
if [[ "$BEFORE_STATUS" != "$AFTER_STATUS" ]]; then
  echo "$LABEL RESTORE_STATUS_FAILED"
  echo "before=$BEFORE_STATUS"
  echo "after=$AFTER_STATUS"
  exit 4
fi
cat "$MUTANT_OUT/$LABEL.summary"
if ! grep -q '^CLUSTER_RED$' "$MUTANT_OUT/$LABEL.summary"; then
  echo "$LABEL MUTANT_SURVIVED"
  exit 5
fi
echo "$LABEL MUTANT_CAUGHT"
echo "restored_bytes=yes restored_status=$AFTER_STATUS"
