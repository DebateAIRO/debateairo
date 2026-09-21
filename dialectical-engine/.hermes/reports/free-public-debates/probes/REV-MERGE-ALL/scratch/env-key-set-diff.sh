#!/bin/zsh
set -u
FILES=(apps/runner/src/dev-api-environment.ts apps/runner/src/dev-api-process.ts apps/runner/src/dev-auth-stack.ts apps/runner/src/dev-cli-provider-panel.ts apps/runner/src/dev-provider-panel.ts apps/runner/src/dev-runner-process.ts packages/register/src/runtime-environment.ts)
for f in $FILES; do
  echo "=================== $f"
  for r in 971e938c 0d34f82f 53d877e1; do
    git show "$r:dialectical-engine/$f" 2>/dev/null | grep -oE "\b[A-Z][A-Z0-9_]{5,}\b" | sort -u > /tmp/claude-501/rev/k-$r.txt
  done
  echo "-- OURS keys missing at merge:"; comm -23 /tmp/claude-501/rev/k-971e938c.txt /tmp/claude-501/rev/k-53d877e1.txt | tr '\n' ' '; echo
  echo "-- THEIRS keys missing at merge:"; comm -23 /tmp/claude-501/rev/k-0d34f82f.txt /tmp/claude-501/rev/k-53d877e1.txt | tr '\n' ' '; echo
done
