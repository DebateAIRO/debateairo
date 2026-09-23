#!/bin/sh
# REQ-REV-S03 pass 2 probe — the measurable claims SPEC-v2 makes, checked in the LANE at 9a000c37.
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine
echo "=== v2 R8 claim: cards.ts:27-28 are display copy, never quoted-exact ==="
sed -n '27,28p' "$L/apps/ui/components/landing/cards.ts"
echo
echo "=== v2 R27 claim: setup-tiers-s03.log line 28 carries the 10/10 correction ==="
sed -n '28p' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/setup-tiers-s03.log
echo
echo "=== v2 R8 claim: tiers-s02-rosters.test.ts:8-9 is the apps+packages root ==="
sed -n '8,9p' "$L/tests/architecture/tiers-s02-rosters.test.ts"
echo
echo "=== how many test cases in tiers-s02-rosters.test.ts (v2 says 4/4 -> 5/5) ==="
grep -c '^  it(' "$L/tests/architecture/tiers-s02-rosters.test.ts"
grep -n '^  it(' "$L/tests/architecture/tiers-s02-rosters.test.ts"
echo
echo "=== R3 claim: a CLI entry has no base_url -> can R20 class 6 (= R11's SIX refusals) be fixtured from the file? ==="
echo "(R11 refusal 6 is a cli slot's OBSERVED base url, not a file field — see v2:157)"
echo
echo "=== R14.3 order rule derivation: the runner's slot-0 pin, re-read at this HEAD ==="
sed -n '65,71p' "$L/apps/runner/src/main.ts"
