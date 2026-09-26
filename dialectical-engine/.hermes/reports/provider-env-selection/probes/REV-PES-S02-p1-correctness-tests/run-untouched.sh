#!/bin/zsh
# Charge 6: PLAN §5 "must NOT be touched" paths — `git diff --stat origin/dev...HEAD -- <path>` empty, each pathspec proved
# able to print (diff vs the empty tree). Usage: WORKTREE=<lane dialectical-engine dir> zsh run-untouched.sh
cd "${WORKTREE:?}" || exit 2
echo "origin/dev=$(git rev-parse --short origin/dev) merge-base=$(git merge-base --short origin/dev HEAD 2>/dev/null || git rev-parse --short $(git merge-base origin/dev HEAD)) HEAD=$(git rev-parse --short HEAD)"
E=4b825dc642cb6eb9a060e54bf8d69288fbee4904
for p in packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts packages/crypto/src/index.ts deploy/vps pnpm-lock.yaml tests/integration/support-config-principals.test.ts; do
  d=$(git diff --stat origin/dev...HEAD -- $p); c=$(git diff --stat $E HEAD -- $p | tail -1)
  echo "$p :: slice-diff=[${d:-empty}] :: can-print=[${c}]"
done
