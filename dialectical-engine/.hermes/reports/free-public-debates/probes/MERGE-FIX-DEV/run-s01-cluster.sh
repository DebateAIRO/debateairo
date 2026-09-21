#!/bin/zsh

set -u

if (( $# != 1 )); then
  print -u2 'usage: run-s01-cluster.sh <run-label>'
  exit 64
fi

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/MERGE-FIX-DEV
orchestrator_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator
runner=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
log_path=$probe_root/s01-list-$1.log

suite_specs=(${(f)"$(sed -n 's/^\(tests[^ ]*\) .*(expect \([0-9]*\)\/\([0-9]*\))/\1:\2:\3/p' "$orchestrator_root/gate-86b391a0-utf8.txt")"})
for index in {1..${#suite_specs}}; do
  case "${suite_specs[$index]}" in
    tests/integration/s8-publication-database.test.ts:*)
      suite_specs[$index]=tests/integration/s8-publication-database.test.ts:26:0 ;;
    tests/architecture/s8-publication-contract.test.ts:*)
      suite_specs[$index]=tests/architecture/s8-publication-contract.test.ts:5:0 ;;
    tests/architecture/register-support-publication.test.ts:*)
      suite_specs[$index]=tests/architecture/register-support-publication.test.ts:14:0 ;;
  esac
done
LOG="$log_path" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 zsh "$runner" "${suite_specs[@]}"
run_rc=$?
print "rc=$run_rc"
rg '^CLUSTER_|^FAIL |^\s*Tests\s+|^\s*Test Files\s+' "$log_path" || true
exit "$run_rc"
