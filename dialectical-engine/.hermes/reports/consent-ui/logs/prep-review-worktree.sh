#!/bin/zsh
# Detached review worktree for a blind lens (mission consent-ui).
# Usage: zsh prep-review-worktree.sh <name> <commit>   -> .worktrees/<name> detached at <commit>, node_modules cloned, contract generated
#        zsh prep-review-worktree.sh --remove <name>   -> refuses if dirty (collect receipts first)
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"; MAIN="$REPO/dialectical-engine"; BASEDIR="$MAIN/.worktrees"
if [[ "${1:-}" == "--remove" ]]; then
  WT="$BASEDIR/${2:?name}"; [[ -d "$WT" ]] || { print "no worktree at $WT"; exit 1; }
  dirty="$(git -C "$WT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  [[ "$dirty" == "0" ]] || { print "REFUSING: $WT has $dirty dirty entries"; exit 2; }
  git -C "$REPO" worktree remove "$WT" && git -C "$REPO" worktree prune && print "removed $WT"; exit $?
fi
NAME="${1:?name}"; COMMIT="${2:?commit}"; WT="$BASEDIR/$NAME"; LANE="$WT/dialectical-engine"
git -C "$REPO" rev-parse --verify "${COMMIT}^{commit}" >/dev/null 2>&1 || { print "not a commit: $COMMIT"; exit 1; }
[[ -e "$WT" ]] && { print "EXISTS $WT"; exit 1; }
git -C "$REPO" worktree add --detach "$WT" "$COMMIT" >/dev/null 2>&1 || exit 1
MODULE_DIRS=("${(@f)$(cd "$MAIN" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
for rel in "${MODULE_DIRS[@]}"; do [[ -n "$rel" && -d "$MAIN/$rel" ]] || continue; mkdir -p "$(dirname "$LANE/$rel")"; cp -Rc "$MAIN/$rel" "$LANE/$rel" 2>/dev/null || cp -R "$MAIN/$rel" "$LANE/$rel"; done
( cd "$LANE" && pnpm run generate:contract >/dev/null 2>&1; print "generate rc=$?" )
print "lane=$LANE head=$(git -C "$LANE" rev-parse --short HEAD) detached=$(git -C "$LANE" branch --show-current | sed 's/^$/yes/') dirty=$(git -C "$LANE" status --porcelain | wc -l | tr -d ' ') modules=$(cd "$LANE" && find . -type d -name node_modules -prune | wc -l | tr -d ' ') contract=$(test -f "$LANE/packages/contract/generated/client.ts" && echo present || echo MISSING)"
