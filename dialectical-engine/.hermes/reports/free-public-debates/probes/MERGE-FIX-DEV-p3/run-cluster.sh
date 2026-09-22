#!/bin/zsh
set -u

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/MERGE-FIX-DEV-p3
gate_file=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/gate-86b391a0-utf8.txt
runner=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
label=$1
suite_log="$probe_root/$label.log"
console_log="$probe_root/$label-console.log"

LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 LOG="$suite_log" zsh "$runner" \
  $(sed -n 's/^\(tests[^ ]*\) .*(expect \([0-9]*\)\/\([0-9]*\))/\1:\2:\3/p' "$gate_file" | \
    sed \
      -e 's#tests/integration/s8-publication-database.test.ts:25:1#tests/integration/s8-publication-database.test.ts:26:0#' \
      -e 's#tests/architecture/s8-publication-contract.test.ts:4:1#tests/architecture/s8-publication-contract.test.ts:5:0#' \
      -e 's#tests/architecture/register-support-publication.test.ts:12:2#tests/architecture/register-support-publication.test.ts:14:0#') \
  >"$console_log" 2>&1
run_rc=$?

print "rc=$run_rc"
grep -E 'CLUSTER_(GREEN|RED)' "$console_log" || true
grep -E '^[[:space:]]*(FAIL|×|✗)|^[[:space:]]*❯ .* > ' "$suite_log" || true
exit "$run_rc"
