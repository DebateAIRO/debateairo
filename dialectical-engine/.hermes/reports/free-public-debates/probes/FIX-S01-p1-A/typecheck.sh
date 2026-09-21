#!/bin/zsh
set -u

WORKTREE=${WORKTREE:?set WORKTREE}
LOG=${LOG:?set LOG}
cd "$WORKTREE" || exit 2
pnpm typecheck > "$LOG" 2>&1
RC=$?
DIAGNOSTICS=$(rg -c 'error TS[0-9]+:' "$LOG" | awk -F: '{ total += $NF } END { print total + 0 }')
ALLOWED=$(rg -c '^(apps/api/src/(publications|index|main)\.ts|packages/db/src/publication\.ts|tests/(unit/fpd-s01-c2-auto-publish|integration/fpd-s01-c2-system-publication|unit/fpd-s01-c3-unpublish-http)\.test\.ts).*error TS' "$LOG" | awk -F: '{ total += $NF } END { print total + 0 }')
echo "typecheck rc=$RC diagnostics=$DIAGNOSTICS base=70 allowed_path_diagnostics=$ALLOWED"
exit 0
