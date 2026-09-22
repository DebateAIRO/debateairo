#!/bin/bash
# CODE-REV-S02-C9 r1 — the "sixteen consent files" set, ×3, with a commit column.
# The SET is stated explicitly (the packet named it in prose only — author D1).
LANE="${1:?lane}"; RUNS="${2:-3}"; cd "$LANE" || exit 99
FILES="$(ls tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts) tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts"
echo "SET (counted, not named): $(printf '%s\n' $FILES | wc -l | tr -d ' ') files"
printf '  %s\n' $FILES
i=1
while [ "$i" -le "$RUNS" ]; do
  o=$(pnpm exec vitest run $FILES 2>&1); e=$?
  echo "### run $i | commit $(git rev-parse --short HEAD) | porcelain $(git status --porcelain | wc -l | tr -d ' ') | exit=$e"
  printf '%s\n' "$o" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
  printf '%s\n' "$o" | grep -E '^[[:space:]]*FAIL[[:space:]]' | sed 's/^/   /'
  i=$((i+1))
done
echo "=== AND at the BASE 19cc8e77 (checked out into a THROWAWAY temp worktree? no — measured by git stash-free means) ==="
