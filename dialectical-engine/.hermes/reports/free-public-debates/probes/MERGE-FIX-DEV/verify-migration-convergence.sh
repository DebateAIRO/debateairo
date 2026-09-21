#!/bin/zsh

set -u

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/MERGE-FIX-DEV
repo_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine
log_path=$probe_root/migration-convergence.log

cd "$repo_root" || exit 70
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec tsx "$probe_root/migration-convergence.ts" >"$log_path" 2>&1
run_rc=$?
print "rc=$run_rc"
rg '^(ORDER_|CATALOGUE_|MIGRATION_|DIFF )' "$log_path" || true
exit "$run_rc"
