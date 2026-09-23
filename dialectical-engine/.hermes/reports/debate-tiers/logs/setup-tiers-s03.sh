#!/bin/zsh
# debate-tiers S03 lane setup: one worktree from integration/debate-tiers @ 7188b167, node_modules
# APFS-cloned from MAIN (never symlinked — TOOLING-TRAPS), generate:contract, then the baseline =
# the suites S03 will touch (tier rosters, dev panel, register, api.env, real-provider pin).
set -u
REPO=/Users/vladmihaimiron/Documents/DebateAIRO
MAIN=$REPO/dialectical-engine
LOGDIR=$MAIN/.hermes/reports/debate-tiers/logs
BASE=7188b167
S=tiers-s03
MODULE_DIRS=("${(@f)$(cd "$MAIN" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
WT=$MAIN/.worktrees/$S; LANE=$WT/dialectical-engine; LOG=$LOGDIR/setup-$S.log
{
  echo "=== $S setup start $(date '+%Y-%m-%d %H:%M:%S') base=$BASE ==="
  cd "$REPO" && git worktree add "$WT" -b "slice/$S" "$BASE" 2>&1 | tail -2
  cd "$LANE" || { echo "NO LANE $LANE"; exit 2; }
  echo "lane HEAD: $(git rev-parse --short HEAD) branch: $(git rev-parse --abbrev-ref HEAD)"
  for rel in "${MODULE_DIRS[@]}"; do
    [[ -n "$rel" ]] || continue
    src="$MAIN/$rel"; dst="$LANE/$rel"
    [[ -d "$src" ]] || continue; [[ -e "$dst" ]] && continue
    mkdir -p "$(dirname "$dst")"; cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
  done
  echo "cloned node_modules trees: $(find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
  test -L node_modules && echo "WARNING node_modules is a symlink" || echo "node_modules is a real dir"
  echo "--- generate:contract ---"; pnpm run generate:contract > /dev/null 2>&1; echo "generate rc=$?"
  test -f packages/contract/generated/client.ts && echo "generated/client.ts PRESENT" || echo "generated/client.ts MISSING"
  echo "--- git status after setup (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
  echo "--- baseline suites (LANG set: adversarial-corpus needs it) ---"
  export LANG=en_US.UTF-8
  for T in tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/render/tier01-new-plan-tier.test.tsx tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/register-support-publication.test.ts tests/unit/api.test.ts; do
    out=$(pnpm exec vitest run "$T" 2>&1); vt=$?
    sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
    echo "$T -> rc=$vt | $sum"
  done
  echo "--- git status after baseline (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
  echo "=== $S setup end $(date '+%Y-%m-%d %H:%M:%S') ==="
} > "$LOG" 2>&1
echo "S03 LANE DONE $(date '+%H:%M:%S')" > $LOGDIR/setup-tiers-s03.done
