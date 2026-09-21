#!/bin/zsh
set -u

WORKTREE=${WORKTREE:?set WORKTREE}
PROBE_OUT=${PROBE_OUT:?set PROBE_OUT}
RUNNER=${RUNNER:?set RUNNER}
LABEL=$1
SOURCE=$2
TARGET=$3
PAIR=$4

cd "$WORKTREE" || exit 2
CAPTURE="$PROBE_OUT/$LABEL.target.captured"
BEFORE_STATUS=$(git status --porcelain -- "$TARGET")
cp "$TARGET" "$CAPTURE" || exit 2
cp "$SOURCE" "$TARGET" || {
  cp "$CAPTURE" "$TARGET"
  exit 3
}
LOG="$PROBE_OUT/$LABEL.log" "$RUNNER" "$PAIR" > "$PROBE_OUT/$LABEL.summary" 2>&1
cp "$CAPTURE" "$TARGET"
cmp -s "$CAPTURE" "$TARGET" || {
  echo "$LABEL RESTORE_BYTES_FAILED"
  exit 4
}
AFTER_STATUS=$(git status --porcelain -- "$TARGET")
if [[ "$BEFORE_STATUS" != "$AFTER_STATUS" ]]; then
  echo "$LABEL RESTORE_STATUS_FAILED"
  echo "before=$BEFORE_STATUS"
  echo "after=$AFTER_STATUS"
  exit 4
fi
cat "$PROBE_OUT/$LABEL.summary"
echo "$LABEL REVIEWER_PROBE_RESTORED"
echo "restored_bytes=yes restored_status=$AFTER_STATUS"
