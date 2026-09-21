#!/bin/zsh

set -u

probe_root=${0:A:h}
suites=("${(@f)$(rg '\.test\.tsx?$' "$probe_root/source-suite-list.log")}")
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run "${suites[@]}" \
  >"$probe_root/source-suites.log" 2>&1
run_rc=$?
print "rc=$run_rc"
rg '^\s*Tests\s+' "$probe_root/source-suites.log" || true
exit "$run_rc"
