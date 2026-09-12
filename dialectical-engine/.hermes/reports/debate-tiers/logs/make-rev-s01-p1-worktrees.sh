#!/bin/zsh
# GATE(S01): three detached lens worktrees at the slice head, node_modules cloned (APFS clonefile), contracts generated.
set -u
MAIN=/Users/vladmihaimiron/Documents/DebateAIRO
SRC=$MAIN/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
HEAD=f6c147cc
for lens in correctness security product; do
  WT=$MAIN/dialectical-engine/.worktrees/rev-s01-p1-$lens
  git -C "$MAIN" worktree add --detach "$WT" "$HEAD" >/dev/null 2>&1 || { echo "WORKTREE FAIL $lens"; continue; }
  DST=$WT/dialectical-engine
  n=0
  while read -r d; do
    mkdir -p "$DST/$(dirname "$d")"
    cp -Rc "$SRC/$d" "$DST/$d" || echo "COPY FAIL $lens $d"
    n=$((n+1))
  done < <(cd "$SRC" && find . -type d -name node_modules -prune | sort)
  if (cd "$DST" && pnpm run generate:contract >"$DST/../.generate-contract.log" 2>&1); then c=ok; else c=FAIL; fi
  echo "$lens ready HEAD=$(git -C "$WT" rev-parse --short HEAD) trees=$n contract=$c dirty=$(git -C "$WT" status --porcelain | wc -l | tr -d ' ') $(date '+%H:%M:%S')"
done
echo LENS_WORKTREES_DONE
