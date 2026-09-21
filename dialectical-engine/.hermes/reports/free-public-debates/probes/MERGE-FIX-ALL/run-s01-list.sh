#!/bin/zsh

set -u

probe_root=${0:A:h}
suite_runner=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
frozen_list=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/verify-head-c358d494-utf8.txt
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
  LOG="$probe_root/s01-list.log" \
  zsh "$suite_runner" \
  $(sed -n 's/^\(tests[^ ]*\) .*(expect \([0-9]*\)\/\([0-9]*\))/\1:\2:\3/p' "$frozen_list") \
  >"$probe_root/s01-list-command.log" 2>&1
run_rc=$?
print "rc=$run_rc"
rg 'CLUSTER_GREEN|^\s*Tests\s+' "$probe_root/s01-list-command.log" || true
exit "$run_rc"
