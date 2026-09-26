#!/bin/zsh
# REV-PES-S03-p3-correctness-tests — pnpm typecheck at the head; diagnostics per file (baseline at a6d6382ba: 0).
W="${1:-${WORKTREE:?}}"; export PATH="/opt/homebrew/bin:$PATH"; cd "$W" || exit 2
HERE="${0:A:h}"
pnpm typecheck > $HERE/typecheck.log 2>&1; echo "rc=$?" >> $HERE/typecheck.log
echo "diagnostics: $(grep -cE 'error TS[0-9]+' $HERE/typecheck.log)"; grep -oE '^[^ (]+\([0-9]+,[0-9]+\): error TS[0-9]+' $HERE/typecheck.log | sort | uniq -c
tail -1 $HERE/typecheck.log
