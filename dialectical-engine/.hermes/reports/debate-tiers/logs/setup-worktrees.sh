#!/bin/zsh
# debate-tiers lane setup: two worktrees from dev @ 7f89f7b7, node_modules APFS-cloned from MAIN (never
# symlinked — TOOLING-TRAPS), generate:contract, then the baseline = the exact suites the lanes will run.
set -u
REPO=/Users/vladmihaimiron/Documents/DebateAIRO
MAIN=$REPO/dialectical-engine
LOGDIR=$MAIN/.hermes/reports/debate-tiers/logs
BASE=7f89f7b7
MODULE_DIRS=("${(@f)$(cd "$MAIN" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
for S in tiers-s01 tiers-s02; do
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
    echo "--- baseline typecheck (repo-wide) ---"; out=$(pnpm typecheck 2>&1); rc=$?; echo "typecheck rc=$rc"; printf '%s\n' "$out" | grep -E 'error TS' | sed -E 's/\(.*//' | sort | uniq -c
    echo "--- baseline suites ---"
    for T in tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts tests/architecture/s14-contract.test.ts; do
      out=$(pnpm exec vitest run "$T" 2>&1); vt=$?
      sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
      echo "$T -> rc=$vt | $sum"
    done
    echo "--- git status after baseline (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
    echo "=== $S setup end $(date '+%Y-%m-%d %H:%M:%S') ==="
  } > "$LOG" 2>&1
done
echo "ALL DONE $(date '+%H:%M:%S')" > $LOGDIR/setup-ALL-DONE.marker
