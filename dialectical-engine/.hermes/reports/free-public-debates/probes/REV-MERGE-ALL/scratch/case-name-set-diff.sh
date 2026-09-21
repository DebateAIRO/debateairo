#!/bin/zsh
set -u
extract() { # rev path
  git show "$1:dialectical-engine/$2" 2>/dev/null | grep -nE "^\s*(it|test|describe)(\.\w+)?\(" | sed -E "s/^[0-9]+:\s*//" | sed -E "s/^(it|test|describe)(\.[a-z]+)?\(\s*//" | sed -E "s/^['\"\`]//" | sed -E "s/['\"\`]\s*,.*$//" | sed -E "s/['\"\`]\s*\)\s*$//"
}
for f in tests/unit/dev-auth-stack.test.ts tests/unit/dev-cli-provider-panel.test.ts tests/integration/dev-api-process.test.ts tests/integration/dev-database-principals.test.ts tests/integration/dev-provider-panel.test.ts; do
  echo "=================== $f"
  extract 971e938c "$f" | sort -u > /tmp/claude-501/rev/ours.txt
  extract 0d34f82f "$f" | sort -u > /tmp/claude-501/rev/theirs.txt
  extract 53d877e1 "$f" | sort -u > /tmp/claude-501/rev/merged.txt
  echo "counts: ours=$(wc -l < /tmp/claude-501/rev/ours.txt) theirs=$(wc -l < /tmp/claude-501/rev/theirs.txt) merged=$(wc -l < /tmp/claude-501/rev/merged.txt)"
  echo "--- OURS cases missing at merge:"; comm -23 /tmp/claude-501/rev/ours.txt /tmp/claude-501/rev/merged.txt
  echo "--- THEIRS cases missing at merge:"; comm -23 /tmp/claude-501/rev/theirs.txt /tmp/claude-501/rev/merged.txt
  echo "--- NEW at merge (neither side):"; cat /tmp/claude-501/rev/ours.txt /tmp/claude-501/rev/theirs.txt | sort -u > /tmp/claude-501/rev/union.txt; comm -13 /tmp/claude-501/rev/union.txt /tmp/claude-501/rev/merged.txt
done
