#!/bin/zsh

set -u

if (( $# < 2 )); then
  print -u2 'usage: run-capture.sh <log> <command> [args...]'
  exit 64
fi

log_path=$1
shift

LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 "$@" >"$log_path" 2>&1
run_rc=$?
print "rc=$run_rc"
rg '^\s*Tests\s+' "$log_path" || true
exit "$run_rc"
