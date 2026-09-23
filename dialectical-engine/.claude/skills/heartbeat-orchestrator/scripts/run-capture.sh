#!/bin/zsh
# run-capture.sh — the capture-first runner every BUILD/FIX/REV packet names (BUILD-S03-C2 F4, 2026-09-13).
#   LOG=<abs log path> zsh run-capture.sh <command> [args…]
# Runs the command with its FULL output written to $LOG first, then prints only: the rc, the failing case
# lines, and the vitest summary lines. The log is the evidence; this stdout is the frame a handoff quotes.
# Never re-run a command to capture it — read the log. One log per run: name it by step and attempt.
set -u
: "${LOG:?LOG=<abs log path> required}"
[ "$#" -ge 1 ] || { echo "usage: LOG=<abs log path> zsh run-capture.sh <command> [args…]" >&2; exit 2; }
case "$LOG" in /*) ;; *) echo "LOG must be an absolute path (got: $LOG)" >&2; exit 2;; esac
mkdir -p "$(dirname "$LOG")"
"$@" > "$LOG" 2>&1
rc=$?
echo "rc=$rc log=$LOG cmd=$*"
# failing cases (vitest prints ' × name' or 'FAIL  path > case'); cap the list so a broken run cannot flood the frame
grep -E '^[[:space:]]*(×|✗|FAIL[[:space:]])' "$LOG" | sed 's/^[[:space:]]*//' | head -40
# the two summary lines, verbatim
grep -E '^[[:space:]]*Test Files[[:space:]]|^[[:space:]]*Tests[[:space:]]' "$LOG"
exit $rc
