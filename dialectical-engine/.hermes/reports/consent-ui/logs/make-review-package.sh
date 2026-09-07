#!/bin/zsh
# Review package for a blind code lens (mission consent-ui).
# Usage: zsh make-review-package.sh <lane-dir> <base-commit> <head-commit> <out-file>
# Writes: commit list, stat summary, full diff with 10 lines of context — one file, one Read.
set -u
LANE="${1:?lane}"; BASE="${2:?base}"; HEAD_="${3:?head}"; OUT="${4:?out}"
{
  print "# Review package — lane $LANE — range $BASE..$HEAD_ — generated $(date '+%Y-%m-%d %H:%M:%S')"
  print "\n## Commits"; git -C "$LANE" log --format='%h %ad %s' --date=format:'%H:%M' "$BASE..$HEAD_"
  print "\n## Stat"; git -C "$LANE" diff --stat "$BASE" "$HEAD_"
  print "\n## Diff (-U10)"; git -C "$LANE" diff -U10 "$BASE" "$HEAD_"
} > "$OUT"
print "package=$OUT lines=$(wc -l < "$OUT" | tr -d ' ') commits=$(git -C "$LANE" rev-list --count "$BASE..$HEAD_") files=$(git -C "$LANE" diff --name-only "$BASE" "$HEAD_" | wc -l | tr -d ' ')"
