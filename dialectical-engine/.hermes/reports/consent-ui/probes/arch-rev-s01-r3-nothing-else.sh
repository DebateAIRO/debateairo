set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
P=docs/missions/consent-ui/slices/S01/PLAN.md
echo "grep: $(grep --version 2>&1|head -1)"
echo "=== the packet's targeted sweep ==="
echo "-- :1010 / :407 / :428 (N3's old text) --"; grep -n ':1010\|:407\|:428' $P; echo "   exit=$?"
echo "-- :791 old CMD-C6 s02 line --"; grep -n 'git diff --stat HEAD --' $P
echo "-- :479 S01-S36 accept --"; grep -c 'WORKING-TREE query, not a history query' $P
echo "-- :947 A9(c) BY CONSTRUCTION s02 row --"; grep -c 'BY CONSTRUCTION (a real mutant needs the merge' $P; echo "   (0 = the old overreaching label is gone)"
echo "-- :1139 refutation row --"; grep -c 'both.*of its forms' $P
echo "-- ADR-00 --"; grep -c 'ADR-00' $P
echo
echo "=== files that must be UNTOUCHED this round ==="
for f in .hermes/reports/consent-ui/mission-graph-S01.md .hermes/TOOLING-TRAPS.md docs/missions/consent-ui/slices/S01/PROGRESS.md docs/missions/consent-ui/slices/S01/SPEC.md docs/missions/consent-ui/slices/S02/SPEC.md docs/missions/consent-ui/INSTRUCTIONS.md; do
  printf '  %-72s %s  %s lines\n' "$f" "$(stat -f '%Sm' -t '%H:%M:%S' "$f")" "$(wc -l < "$f" | tr -d ' ')"
done
echo "=== frozen md5s ==="
md5 -q docs/missions/consent-ui/slices/S01/SPEC.md docs/missions/consent-ui/slices/S02/SPEC.md docs/missions/consent-ui/INSTRUCTIONS.md
echo "=== written this round (mtimes) ==="
for f in docs/missions/consent-ui/slices/S01/PLAN.md docs/missions/consent-ui/slices/S01/DECISIONS.md .hermes/reports/consent-ui/agent-reports/ARCH-S01.md; do
  printf '  %-70s %s  %s lines\n' "$f" "$(stat -f '%Sm' -t '%H:%M:%S' "$f")" "$(wc -l < "$f" | tr -d ' ')"
done
echo "=== S02 artifacts must be untouched by S01's round ==="
stat -f '  %Sm  %N' -t '%H:%M:%S' docs/missions/consent-ui/slices/S02/PLAN.md docs/missions/consent-ui/slices/S02/DECISIONS.md
