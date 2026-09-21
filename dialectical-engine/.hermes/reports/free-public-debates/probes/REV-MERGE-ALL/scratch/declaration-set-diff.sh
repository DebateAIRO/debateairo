#!/bin/zsh
set -u
FILES=(apps/runner/src/dev-api-environment.ts apps/runner/src/dev-api-process.ts apps/runner/src/dev-auth-stack.ts apps/runner/src/dev-cli-provider-panel.ts apps/runner/src/dev-provider-panel.ts apps/runner/src/dev-runner-process.ts packages/register/src/runtime-environment.ts apps/ui/components/support/Assistant.tsx)
for f in $FILES; do
  echo "=================== $f"
  for r in 971e938c 0d34f82f 53d877e1; do
    git show "$r:dialectical-engine/$f" 2>/dev/null | grep -oE "^(export )?(async )?(function|const|type|class) [A-Za-z_][A-Za-z0-9_]*|^  (async )?[a-zA-Z_][A-Za-z0-9_]*\(" | sed -E 's/^ +//' | sort -u > /tmp/claude-501/rev/a-$r.txt
  done
  echo "-- OURS decls missing at merge:"; comm -23 /tmp/claude-501/rev/a-971e938c.txt /tmp/claude-501/rev/a-53d877e1.txt | tr '\n' '|'; echo
  echo "-- THEIRS decls missing at merge:"; comm -23 /tmp/claude-501/rev/a-0d34f82f.txt /tmp/claude-501/rev/a-53d877e1.txt | tr '\n' '|'; echo
done
