#!/bin/zsh
# consent-ui worktree setup: APFS clone-copy node_modules from MAIN (never symlink — TOOLING-TRAPS),
# then generate:contract, then baseline = the exact commands the lanes will run.
set -u
REPO=/Users/vladmihaimiron/Documents/DebateAIRO
MAIN=$REPO/dialectical-engine
LOGDIR=$MAIN/.hermes/reports/consent-ui/logs
MODULE_DIRS=("${(@f)$(cd "$MAIN" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
for S in consent-s01 consent-s02; do
  LANE=$MAIN/.worktrees/$S/dialectical-engine
  LOG=$LOGDIR/setup-$S.log
  {
    echo "=== $S setup start $(date '+%Y-%m-%d %H:%M:%S') ==="
    cd "$LANE" || { echo "NO LANE $LANE"; continue; }
    echo "node_modules trees to clone from main: ${#MODULE_DIRS}"
    for rel in "${MODULE_DIRS[@]}"; do
      [[ -n "$rel" ]] || continue
      src="$MAIN/$rel"; dst="$LANE/$rel"
      [[ -d "$src" ]] || continue
      [[ -e "$dst" ]] && continue
      mkdir -p "$(dirname "$dst")"
      cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
    done
    echo "cloned trees now in lane: $(find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
    test -L node_modules && echo "WARNING node_modules is a symlink" || echo "node_modules is a real dir"
    echo "--- generate:contract ---"; pnpm run generate:contract > /dev/null 2>&1; echo "generate rc=$?"
    test -f packages/contract/generated/client.ts && echo "generated/client.ts PRESENT" || echo "generated/client.ts MISSING"
    echo "--- git status after setup (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
    echo "--- baseline typecheck (repo-wide) ---"; out=$(pnpm typecheck 2>&1); rc=$?; echo "typecheck rc=$rc"; printf '%s\n' "$out" | grep -E 'error TS' | sed -E 's/\(.*//' | sort | uniq -c | sort -rn | head -20; echo "total TS errors: $(printf '%s\n' "$out" | grep -c 'error TS')"
    echo "--- baseline tests (the lane's own commands) ---"
    for T in tests/render/auth-flow-integration.test.tsx tests/unit/t9-mode-tokens.test.ts; do
      out=$(pnpm exec vitest run "$T" 2>&1); vt=$?
      sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
      echo "$T -> rc=$vt | $sum"
    done
    echo "--- git status after baseline (expect 0) ---"; git status --porcelain | wc -l | tr -d ' '
    echo "=== $S setup end $(date '+%Y-%m-%d %H:%M:%S') ==="
  } > "$LOG" 2>&1
done
echo "ALL DONE $(date '+%H:%M:%S')" > $LOGDIR/setup-ALL-DONE.marker
