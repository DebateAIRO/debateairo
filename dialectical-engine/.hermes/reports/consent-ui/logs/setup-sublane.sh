#!/bin/zsh
# Sub-lane for a parallel cluster chain (mission consent-ui).
# Usage: zsh setup-sublane.sh <name> <branch> <start-commit>  -> .worktrees/<name> on NEW branch <branch> at <start-commit>, node_modules cloned, contract generated
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"; MAIN="$REPO/dialectical-engine"; BASEDIR="$MAIN/.worktrees"
NAME="${1:?name}"; BRANCH="${2:?branch}"; START="${3:?start}"; WT="$BASEDIR/$NAME"; LANE="$WT/dialectical-engine"
git -C "$REPO" rev-parse --verify "${START}^{commit}" >/dev/null 2>&1 || { print "not a commit: $START"; exit 1; }
[[ -e "$WT" ]] && { print "EXISTS $WT"; exit 1; }
git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH" && { print "BRANCH EXISTS $BRANCH"; exit 1; }
git -C "$REPO" worktree add -b "$BRANCH" "$WT" "$START" >/dev/null 2>&1 || { print "worktree add failed"; exit 1; }
MODULE_DIRS=("${(@f)$(cd "$MAIN" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
for rel in "${MODULE_DIRS[@]}"; do [[ -n "$rel" && -d "$MAIN/$rel" ]] || continue; mkdir -p "$(dirname "$LANE/$rel")"; cp -Rc "$MAIN/$rel" "$LANE/$rel" 2>/dev/null || cp -R "$MAIN/$rel" "$LANE/$rel"; done
( cd "$LANE" && pnpm run generate:contract >/dev/null 2>&1; print "generate rc=$?" )
print "lane=$LANE branch=$(git -C "$LANE" branch --show-current) head=$(git -C "$LANE" rev-parse --short HEAD) dirty=$(git -C "$LANE" status --porcelain | wc -l | tr -d ' ') modules=$(cd "$LANE" && find . -type d -name node_modules -prune | wc -l | tr -d ' ') contract=$(test -f "$LANE/packages/contract/generated/client.ts" && echo present || echo MISSING)"
