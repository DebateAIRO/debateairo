#!/bin/zsh
set -u

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/MERGE-FIX-DEV-p3
label=$1
shift
log_path="$probe_root/$label.log"

LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 "$@" >"$log_path" 2>&1
run_rc=$?

print "rc=$run_rc"
grep -E 'Tests[[:space:]]+[0-9]+ (passed|failed)' "$log_path" || true
grep -E '^[[:space:]]*(FAIL|×|✗)|^[[:space:]]*❯ .* > ' "$log_path" || true
exit "$run_rc"
