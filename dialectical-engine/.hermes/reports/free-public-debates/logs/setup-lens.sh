#!/bin/zsh
# setup-lens.sh <LENS> <PASS> <SLICE_HEAD> — one DETACHED lens worktree at the slice head, node_modules APFS-cloned
# from the S01 lane (never symlinked), generate:contract run (TRAPS: "A lens worktree needs `pnpm run generate:contract`…").
set -u
LENS=$1; PASS=$2; HEAD_SHA=$3
REPO=/Users/vladmihaimiron/Documents/DebateAIRO
SRC=$REPO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine
LOGDIR=$REPO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs
WT=$REPO/dialectical-engine/.worktrees/fpd-rev-s01-p$PASS-$LENS; LANE=$WT/dialectical-engine; LOG=$LOGDIR/setup-lens-p$PASS-$LENS.log
MODULE_DIRS=("${(@f)$(cd "$SRC" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
{
  echo "=== lens $LENS p$PASS setup start $(date '+%F %T') head=$HEAD_SHA ==="
  cd "$REPO" && git worktree add --detach "$WT" "$HEAD_SHA" 2>&1 | tail -1
  cd "$LANE" || { echo "NO LANE $LANE"; exit 2; }
  for rel in "${MODULE_DIRS[@]}"; do
    [[ -n "$rel" ]] || continue; src="$SRC/$rel"; dst="$LANE/$rel"
    [[ -d "$src" ]] || continue; [[ -e "$dst" ]] && continue
    mkdir -p "$(dirname "$dst")"; cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
  done
  echo "cloned node_modules trees: $(find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
  pnpm run generate:contract > /dev/null 2>&1; echo "generate rc=$?"
  echo "head: $(git rev-parse --short HEAD) dirty: $(git status --porcelain | wc -l | tr -d ' ')"
  echo "=== end $(date '+%F %T') ==="
} > "$LOG" 2>&1
tail -4 "$LOG"
