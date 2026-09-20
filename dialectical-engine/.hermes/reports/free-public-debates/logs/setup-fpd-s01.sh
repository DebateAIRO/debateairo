#!/bin/zsh
# free-public-debates S01 lane setup: one worktree from integration/all @ 5b6cc9b1, node_modules
# APFS-cloned from the integration/all tree (never symlinked — TOOLING-TRAPS), generate:contract, then
# the baseline = every suite that reads the publication, erasure and plan-tier surfaces.
set -u
REPO=/Users/vladmihaimiron/Documents/DebateAIRO
SRC=$REPO/dialectical-engine/.worktrees/all/dialectical-engine
LOGDIR=$SRC/.hermes/reports/free-public-debates/logs
BASE=5b6cc9b1
S=fpd-s01
MODULE_DIRS=("${(@f)$(cd "$SRC" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
WT=$REPO/dialectical-engine/.worktrees/$S; LANE=$WT/dialectical-engine; LOG=$LOGDIR/setup-$S.log
{
  echo "=== $S setup start $(date '+%Y-%m-%d %H:%M:%S') base=$BASE ==="
  cd "$REPO" && git worktree add "$WT" -b "slice/free-public-debates-s01" "$BASE" 2>&1 | tail -2
  cd "$LANE" || { echo "NO LANE $LANE"; exit 2; }
  echo "lane HEAD: $(git rev-parse --short HEAD) branch: $(git rev-parse --abbrev-ref HEAD)"
  for rel in "${MODULE_DIRS[@]}"; do
    [[ -n "$rel" ]] || continue
    src="$SRC/$rel"; dst="$LANE/$rel"
    [[ -d "$src" ]] || continue; [[ -e "$dst" ]] && continue
    mkdir -p "$(dirname "$dst")"; cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
  done
  echo "cloned node_modules trees: $(find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
  test -L node_modules && echo "WARNING node_modules is a symlink" || echo "node_modules is a real dir"
  echo "--- generate:contract ---"; pnpm run generate:contract > /dev/null 2>&1; echo "generate rc=$?"
  test -f packages/contract/generated/client.ts && echo "generated/client.ts PRESENT" || echo "generated/client.ts MISSING"
  echo "--- git status after setup (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
  echo "--- baseline suites ---"
  export LANG=en_US.UTF-8
  for T in tests/unit/s8-publication.test.ts tests/unit/s8-publication-http.test.ts tests/integration/s8-publication-database.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/s7-authorization.test.ts tests/unit/s10-erasure-http.test.ts tests/unit/pda-s04-node-carrier-audit.test.ts tests/unit/tiers-s02-admission.test.ts tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/plan-tiers-route-privileges.test.ts tests/architecture/register-support-publication.test.ts tests/unit/api.test.ts; do
    out=$(pnpm exec vitest run "$T" 2>&1); vt=$?
    sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
    echo "$T -> rc=$vt | $sum"
  done
  echo "--- typecheck (count of diagnostics at base) ---"
  pnpm exec tsc --noEmit > $LOGDIR/typecheck-base.log 2>&1; echo "tsc rc=$? errors=$(grep -c 'error TS' $LOGDIR/typecheck-base.log)"
  echo "--- git status after baseline (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
  echo "=== $S setup end $(date '+%Y-%m-%d %H:%M:%S') ==="
} > "$LOG" 2>&1
echo "FPD-S01 LANE DONE $(date '+%H:%M:%S')" > $LOGDIR/setup-fpd-s01.done
