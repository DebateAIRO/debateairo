#!/bin/zsh
# ARCH-REV-S02-p2 · the decisive probe for PLAN §9 F-6 and step S02-M4.
# A FIXTURE with known hits, so every answer is checkable against a ground truth I control.
set -u
D=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-REV-S02/fx
mkdir -p "$D"
cat > "$D/plan-tiers.ts" <<'EOF'
export const PLAN_TIER_ROSTERS = Object.freeze({
  free: ["gpt-5.6-luna", "claude-sonnet-5"],
  premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]
});
export type PlanTier = "free" | "premium";
const unrelated = 1;
EOF
# GROUND TRUTH: 1 line carries PLAN_TIER_ROSTERS, 1 line carries PlanTier -> a correct
# alternation answers 2 lines; a literal-pipe reading answers 0.

echo "### grep binary as this .sh sees it:"; grep --version | head -1
echo

echo "===== S02-M4's PUBLISHED form: BRE with an escaped pipe ====="
echo '$ grep -n '\''PLAN_TIER_ROSTERS\|PlanTier'\'' fx/plan-tiers.ts'
grep -n 'PLAN_TIER_ROSTERS\|PlanTier' "$D/plan-tiers.ts"; echo "rc=$?  lines=$(grep -c 'PLAN_TIER_ROSTERS\|PlanTier' "$D/plan-tiers.ts" 2>/dev/null || echo 0)"
echo "GROUND TRUTH = 2 lines"
echo

echo "===== the same intent as an ERE ====="
echo '$ grep -nE '\''PLAN_TIER_ROSTERS|PlanTier'\'' fx/plan-tiers.ts'
grep -nE 'PLAN_TIER_ROSTERS|PlanTier' "$D/plan-tiers.ts"; echo "rc=$?"
echo

echo "===== does the escaped pipe match a LITERAL pipe instead? ====="
echo '$ grep -n '\''free\|premium'\'' fx/plan-tiers.ts   (literal reading would need the chars free|premium)'
grep -n 'free\|premium' "$D/plan-tiers.ts"; echo "rc=$?"
echo

echo "===== F-6's two forms, on the REAL tree, from this .sh ====="
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine || exit 99
echo '$ grep -rn ": AskRequest = {|as AskRequest" tests   (the pass-1 published form)'
grep -rn ': AskRequest = {|as AskRequest' tests; echo "rc=$?  hits=$(grep -rn ': AskRequest = {|as AskRequest' tests 2>/dev/null | wc -l | tr -d ' ')"
echo '$ grep -rnE ": AskRequest = \{|as AskRequest" tests   (the Revision-2 corrected form)'
echo "hits=$(grep -rnE ': AskRequest = \{|as AskRequest' tests | wc -l | tr -d ' ')  rc=$?"
echo '$ grep -rnE ": AskRequest = {|as AskRequest" tests   (-E, UNESCAPED brace — plan says hard error)'
grep -rnE ': AskRequest = {|as AskRequest' tests > /dev/null 2>"$D/err.txt"; echo "rc=$?  stderr=[$(cat "$D/err.txt")]  hits=$(grep -rnE ': AskRequest = {|as AskRequest' tests 2>/dev/null | wc -l | tr -d ' ')"
echo
echo "===== does tests/unit/api.test.ts carry PlanTier at base at all? ====="
echo "PlanTier occurrences: $(grep -c 'PlanTier' tests/unit/api.test.ts 2>/dev/null || echo 0)"
echo "PLAN_TIER_ROSTERS occurrences: $(grep -c 'PLAN_TIER_ROSTERS' tests/unit/api.test.ts 2>/dev/null || echo 0)"
echo "planTier (lowercase p) occurrences: $(grep -c 'planTier' tests/unit/api.test.ts 2>/dev/null || echo 0)"
echo "plan_tier occurrences: $(grep -c 'plan_tier' tests/unit/api.test.ts 2>/dev/null || echo 0)"
echo "### dirty: $(git status --porcelain | wc -l | tr -d ' ')"
