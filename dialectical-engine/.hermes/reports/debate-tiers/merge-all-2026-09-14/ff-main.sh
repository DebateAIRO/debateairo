#!/bin/zsh
# ff-main.sh — bring the main checkout (integration/debate-tiers) to integration/all by fast-forward, losslessly.
#   Everything is recomputed at run time against the CURRENT integration/all head:
#   1. untracked files in main at paths integration/all creates: byte-identical ones are removed (the checkout recreates them,
#      tracked, same bytes); differing ones are copied aside and put back afterwards as modified tracked files;
#   2. dirty tracked files at paths integration/all changes: their diffs are saved, they are restored to HEAD, the ff runs,
#      then each diff is re-applied 3-way (rehearsed on the same tree beforehand: clean, no markers);
#   Undo of the ff: the full pre-ff state is wip/main-checkout-2026-09-16 (tree snapshot); the branch tip before = 446c685e.
set -u
R=/Users/vladmihaimiron/Documents/DebateAIRO; M=$R/dialectical-engine
S=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad
W=$S/ff-main-work; rm -rf $W; mkdir -p $W/dirty $W/drafts
cd $R || exit 9
[ "$(git rev-parse --abbrev-ref HEAD)" = integration/debate-tiers ] || { echo "main not on integration/debate-tiers"; exit 8; }
git merge-base --is-ancestor HEAD integration/all || { echo "HEAD not an ancestor of integration/all"; exit 7; }
git rev-parse -q --verify wip/main-checkout-2026-09-16 >/dev/null || { echo "no preservation snapshot"; exit 6; }
echo "BEFORE: HEAD=$(git rev-parse --short HEAD) target=$(git rev-parse --short integration/all) dirty-tracked=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ') untracked=$(git status --porcelain | grep -c '^??') $(date '+%T')"
git status --porcelain --untracked-files=all | grep '^??' | sed 's/^?? //; s/^"//; s/"$//' | sort > $W/untracked.txt
git status --porcelain --untracked-files=no | sed 's/^...//; s/^"//; s/"$//' | sort > $W/dirty.txt
git diff --name-only --diff-filter=A HEAD integration/all | sort > $W/added.txt
git diff --name-only HEAD integration/all | sort > $W/changed.txt
comm -12 $W/untracked.txt $W/added.txt > $W/overlap-untracked.txt
comm -12 $W/dirty.txt $W/changed.txt > $W/overlap-dirty.txt
echo "overlap: untracked=$(wc -l < $W/overlap-untracked.txt | tr -d ' ') dirty-tracked=$(wc -l < $W/overlap-dirty.txt | tr -d ' ')"
# 1. untracked overlap
same=0; while read f; do
  if [ "$(git hash-object "$f")" = "$(git rev-parse -q --verify "integration/all:$f")" ]; then rm -f "$f"; same=$((same+1))
  else mkdir -p "$W/drafts/$(dirname $f)"; cp "$f" "$W/drafts/$f"; rm -f "$f"; echo "   draft kept aside (differs): $f"; fi
done < $W/overlap-untracked.txt; echo "removed $same identical untracked files; drafts aside: $(find $W/drafts -type f | wc -l | tr -d ' ')"
# 2. dirty overlap
while read f; do mkdir -p "$W/dirty/$(dirname $f)"; git diff -- "$f" > "$W/dirty/$f.patch"; cp "$f" "$W/dirty/$f.before"; git checkout -q -- "$f"; echo "   dirty saved+restored to HEAD: $f"; done < $W/overlap-dirty.txt
if ! git merge --ff-only integration/all > $W/ff.log 2>&1; then
  echo "FF REFUSED:"; head -20 $W/ff.log; echo "putting everything back"
  while read f; do cp "$W/dirty/$f.before" "$f"; done < $W/overlap-dirty.txt
  (cd $W/drafts && find . -type f | sed 's#^\./##') | while read f; do cp "$W/drafts/$f" "$R/$f"; done
  exit 5
fi
echo "FF OK: HEAD=$(git rev-parse --short HEAD)"
# re-apply the dirty edits 3-way, unstaged like before
fail=0; while read f; do
  if git apply -3 "$W/dirty/$f.patch" >/dev/null 2>&1; then git reset -q -- "$f"; echo "   re-applied: $f markers=$(grep -c '^<<<<<<<' "$f")"
  else
    git checkout -q -- "$f"   # discard the conflicted attempt; the merged version is back
    if [ "$f" = "dialectical-engine/docs/missions/observability-agents/slices/FIX-07/DECISIONS.md" ]; then
      # the one rehearsed failure: a single added line, adjacent to lines the observability branch added; insert it after its original anchor
      line=$(grep '^+- 2026-09-02 · Where does the capture OFF switch live' "$W/dirty/$f.patch" | sed 's/^+//')
      [ -n "$line" ] && perl -i -pe 'BEGIN{$l=shift} if (!$done && /Why after FIX-01\?/) { $_ .= "$l\n"; $done=1 }' "$line" "$f"
      grep -qF -- "$line" "$f" && echo "   re-applied by insertion: $f (after its 'Why after FIX-01?' anchor) markers=$(grep -c '^<<<<<<<' "$f")" || { echo "   !!! insertion FAILED: $f (pre-ff copy: $W/dirty/$f.before)"; fail=$((fail+1)); }
    else echo "   !!! re-apply FAILED: $f (its pre-ff copy: $W/dirty/$f.before)"; fail=$((fail+1)); fi
  fi
done < $W/overlap-dirty.txt
# drafts back
(cd $W/drafts && find . -type f | sed 's#^\./##') | while read f; do cp "$W/drafts/$f" "$R/$f"; echo "   draft restored as modified: $f"; done
echo "AFTER: HEAD=$(git rev-parse --short HEAD) dirty-tracked=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ') untracked=$(git status --porcelain | grep -c '^??') re-apply-failures=$fail $(date '+%T')"
