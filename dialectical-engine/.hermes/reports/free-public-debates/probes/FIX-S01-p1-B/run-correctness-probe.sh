#!/bin/zsh
set -u

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/FIX-S01-p1-B
lane_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine
source_file="$probe_root/promoted/correctness/rev-s01-p1-correctness-probe.test.ts"
target_file="$lane_root/tests/integration/rev-s01-p1-correctness-probe.test.ts"
log_file="${1:?usage: run-correctness-probe.sh LOG_FILE}"
test_pattern="${2:-}"

if [[ -e "$target_file" ]]; then
  print -r -- "rc=2"
  print -r -- "FAIL target already exists: $target_file"
  exit 2
fi

cp "$source_file" "$target_file"
trap 'rm -f "$target_file"' EXIT

cd "$lane_root"
if [[ -n "$test_pattern" ]]; then
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run \
    tests/integration/rev-s01-p1-correctness-probe.test.ts \
    -t "$test_pattern" > "$log_file" 2>&1
else
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run \
    tests/integration/rev-s01-p1-correctness-probe.test.ts > "$log_file" 2>&1
fi
probe_rc=$?

print -r -- "rc=$probe_rc"
rg "^( FAIL| Test Files|      Tests)|delete during an in-flight" "$log_file" || true
exit "$probe_rc"
