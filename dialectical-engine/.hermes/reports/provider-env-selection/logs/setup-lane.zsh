#!/bin/zsh
# setup-lane.zsh <name> <sha> [branch] [modules-source-lane] — a lane worktree at <sha> (detached, or on a NEW branch when given),
# node_modules APFS-cloned from the nearest lane on the same lockfile generation, then `pnpm install --offline --frozen-lockfile`
# to reconcile, contract generated, 0 dirty. Prints the lane path. (orchestrator §1: one worktree per slice.)
set -u
export PATH="/opt/homebrew/bin:$PATH"
NAME=${1:?name}; SHA=${2:?sha}; BRANCH=${3:-}; SRC=${4:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine}
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO; MAIN=$ROOT/dialectical-engine; L=$MAIN/.hermes/reports/provider-env-selection/logs
WT=$MAIN/.worktrees/$NAME; LANE=$WT/dialectical-engine
MODULE_DIRS=("${(@f)$(cd "$SRC" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
if [[ -n "$BRANCH" ]]; then git -C "$ROOT" worktree add -b "$BRANCH" "$WT" "$SHA" 2>&1 | tail -1; else git -C "$ROOT" worktree add --detach "$WT" "$SHA" 2>&1 | tail -1; fi
cd "$LANE" || { echo "NO LANE $LANE"; exit 2; }
for rel in "${MODULE_DIRS[@]}"; do
  [[ -n "$rel" ]] || continue; src="$SRC/$rel"; dst="$LANE/$rel"
  [[ -d "$src" ]] || continue; [[ -e "$dst" ]] && continue
  mkdir -p "$(dirname "$dst")"; cp -Rc "$src" "$dst" 2>/dev/null || cp -R "$src" "$dst"
done
echo "modules cloned from $SRC ($(find . -type d -name node_modules -prune | wc -l | tr -d ' ') trees) $(date '+%T')"
pnpm install --offline --frozen-lockfile > "$L/pnpm-install-$NAME.log" 2>&1; rc=$?; echo "pnpm install --offline rc=$rc $(date '+%T')"
if (( rc != 0 )); then pnpm install --prefer-offline --frozen-lockfile > "$L/pnpm-install-$NAME-2.log" 2>&1; echo "pnpm install --prefer-offline rc=$? $(date '+%T')"; fi
pnpm run generate:contract > /dev/null 2>&1; echo "generate rc=$?"
echo "worktree $LANE HEAD=$(git rev-parse --short HEAD) ref=$(git rev-parse --abbrev-ref HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ') $(date '+%T')"
