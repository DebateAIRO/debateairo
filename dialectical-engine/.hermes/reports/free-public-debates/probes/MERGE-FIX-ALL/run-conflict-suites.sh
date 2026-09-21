#!/bin/zsh

set -u

probe_root=${0:A:h}
suites=(
  tests/unit/dev-auth-stack.test.ts
  tests/unit/dev-cli-provider-panel.test.ts
  tests/integration/dev-api-process.test.ts
  tests/integration/dev-database-principals.test.ts
  tests/integration/dev-provider-panel.test.ts
)
worst_rc=0
for run_number in 1 2 3; do
  run_log="$probe_root/conflict-suites-run-$run_number.log"
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run "${suites[@]}" >"$run_log" 2>&1
  run_rc=$?
  (( run_rc > worst_rc )) && worst_rc=$run_rc
  print "run=$run_number rc=$run_rc"
  rg '^\s*Tests\s+' "$run_log" || true
done
exit "$worst_rc"
