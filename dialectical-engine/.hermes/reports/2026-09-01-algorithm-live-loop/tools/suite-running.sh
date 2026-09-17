#!/bin/bash
# suite-running.sh — is a test suite ACTUALLY running, and where? (D59)
# Usage: suite-running.sh [worktree-substring]   exit 0 = something is running, 1 = nothing
#
# WHY THIS EXISTS. `pgrep -f 'vitest'` matches the COMMAND LINE, and any process whose arguments
# quote a document mentioning vitest matches too. Tonight a codex review whose packet named the
# tool was reported as a running suite THREE separate times, once after the check had already been
# "fixed" — including a 24-minute "suite" that was a static review reading files.
# Matching a command line is matching TEXT. This matches the EXECUTABLE and excludes the reviewers.
set -u
WANT=${1:-}
found=1
for p in $(pgrep -f vitest 2>/dev/null); do
  cmd=$(ps -o command= -p "$p" 2>/dev/null)
  case "$cmd" in codex*|*"codex exec"*) continue;; esac      # a reviewer quoting the word
  case "$cmd" in *node*vitest*|*vitest*run*) ;; *) continue;; esac
  cwd=$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//')
  if [ -n "$WANT" ]; then case "$cwd" in *"$WANT"*) ;; *) continue;; esac; fi
  printf 'SUITE RUNNING  pid=%s  elapsed=%s\n  cwd=%s\n' "$p" "$(ps -o etime= -p "$p" | tr -d ' ')" "$cwd"
  found=0
done
[ $found -eq 1 ] && echo "no suite running${WANT:+ in *$WANT*}"
exit $found
