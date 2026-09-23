#!/bin/zsh
# Promoted WHOLE-REV-grok-4.6 probes. Root from $WORKTREE or argv[1], never hard-coded.
set -eu
ROOT="${WORKTREE:-${1:?set WORKTREE or pass the worktree root}}"
HERE="${0:A:h}"
cd "$ROOT"
node "$HERE/WHOLE-REV-grok-4.6-css-done-md.mjs" "$ROOT"
cp "$HERE/WHOLE-REV-grok-4.6-s01-ac.test.tsx" tests/render/
cp "$HERE/WHOLE-REV-grok-4.6-s01-wire.test.ts" tests/unit/
cp "$HERE/WHOLE-REV-grok-4.6-s02-admission.test.ts" tests/unit/
pnpm exec vitest run \
  tests/render/WHOLE-REV-grok-4.6-s01-ac.test.tsx \
  tests/unit/WHOLE-REV-grok-4.6-s01-wire.test.ts \
  tests/unit/WHOLE-REV-grok-4.6-s02-admission.test.ts
rm -f tests/render/WHOLE-REV-grok-4.6-s01-ac.test.tsx \
      tests/unit/WHOLE-REV-grok-4.6-s01-wire.test.ts \
      tests/unit/WHOLE-REV-grok-4.6-s02-admission.test.ts
echo "probes removed; porcelain for those paths:"
git status --porcelain -- tests/render/WHOLE-REV-grok-4.6-s01-ac.test.tsx tests/unit/WHOLE-REV-grok-4.6-s01-wire.test.ts tests/unit/WHOLE-REV-grok-4.6-s02-admission.test.ts
