set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s01/dialectical-engine
MAIN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
echo "--- grep --version ---"; grep --version 2>&1 | head -1
echo "--- GROUND TRUTH in the LANE ---"
cd "$LANE"
grep -nE 'expect\(measuredRows\)\.toBe\(34\)|expect\(rows\)\.toHaveLength\(names\.length\)' tests/unit/t9-mode-tokens.test.ts; echo "exit=$?"
echo "--- sed 426p;433p ---"
sed -n '426p;433p' tests/unit/t9-mode-tokens.test.ts
echo "--- what is actually AT :407 and :428 (the old pointers) ---"
sed -n '407p;428p' tests/unit/t9-mode-tokens.test.ts
echo "--- PLAN.md must no longer contain :407 / :428 ---"
cd "$MAIN"
grep -n ':407\|:428' docs/missions/consent-ui/slices/S01/PLAN.md; echo "exit=$?"
echo "--- the corrected Boundaries block ---"
grep -n 'measuredRows' docs/missions/consent-ui/slices/S01/PLAN.md
echo "--- any OTHER t9-mode-tokens.test.ts:<n> citation anywhere in PLAN.md ---"
grep -noE 't9-mode-tokens\.test\.ts:[0-9]+(-[0-9]+)?' docs/missions/consent-ui/slices/S01/PLAN.md | sort -u
