#!/bin/zsh
# ARCH-REV-S02-p2 · every citation and constant the Revision-2 charges rest on, re-measured BY ME.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine
MAIN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
cd "$LANE" || exit 99
echo "### lane HEAD $(git rev-parse --short HEAD)  dirty=$(git status --porcelain | wc -l | tr -d ' ')"
sec () { echo; echo "=============== $* ==============="; }

sec "0 · grep flavour"
grep --version | head -2

sec "N4.1 · evaluateAskAdmission import — api.test.ts:5 and the specifier at :10"
awk 'NR>=1 && NR<=14{printf "%4d| %s\n", NR, $0}' tests/unit/api.test.ts

sec "N4.2 · the query-list assertion — api.test.ts:365, and :366"
awk 'NR>=363 && NR<=367{printf "%4d| %s\n", NR, $0}' tests/unit/api.test.ts

sec "N4.3 · the R13 ask-literal grep, BOTH forms (finding F-6) — proof on a known hit"
echo "--- pass-1 published form (no -E, bare pipe) ---"
grep -rn ': AskRequest = {|as AskRequest' tests; echo "rc=$?  hits=$(grep -rn ': AskRequest = {|as AskRequest' tests | wc -l | tr -d ' ')"
echo "--- Revision-2 corrected form (-E, escaped brace) ---"
grep -rnE ': AskRequest = \{|as AskRequest' tests; echo "rc=$?"
echo "hits=$(grep -rnE ': AskRequest = \{|as AskRequest' tests | wc -l | tr -d ' ')  files=$(grep -rlnE ': AskRequest = \{|as AskRequest' tests | wc -l | tr -d ' ')"
echo "--- KNOWN HIT proof: does api.test.ts:125 really carry an ask literal? ---"
awk 'NR>=125 && NR<=125{printf "%4d| %s\n", NR, $0}' tests/unit/api.test.ts
echo "--- -E with an UNescaped brace (the plan claims ugrep rejects it) ---"
grep -rnE ': AskRequest = {|as AskRequest' tests 2>&1 | head -3; echo "rc=$?"

sec "N4.4 · evaluator-database.test.ts :1378-1389"
awk 'NR>=1377 && NR<=1390{printf "%4d| %s\n", NR, $0}' tests/integration/evaluator-database.test.ts

sec "N4.5 · migrations/0040_account_erasure.sql:4316-4318"
awk 'NR>=4316 && NR<=4318{printf "%4d| %s\n", NR, $0}' migrations/0040_account_erasure.sql

sec "N4.6 · the hand-numbered placeholders, packages/db/src/index.ts:1248-1252 (BOTH \$13s)"
awk 'NR>=1242 && NR<=1252{printf "%4d| %s\n", NR, $0}' packages/db/src/index.ts

sec "N4.7 · startRun call sites"
echo "grep -rn 'startRun(' apps packages tests acceptance   = $(grep -rn 'startRun(' apps packages tests acceptance | wc -l | tr -d ' ')"
echo "grep -rn '\\.startRun(' apps packages :"; grep -rn '\.startRun(' apps packages
echo "files under tests/ carrying startRun( = $(grep -rln 'startRun(' tests | wc -l | tr -d ' ')"

sec "N4.8 · the startRun call, apps/api/src/index.ts:1293 and :1317"
awk 'NR>=1293 && NR<=1293{printf "%4d| %s\n", NR, $0}' apps/api/src/index.ts
awk 'NR>=1303 && NR<=1303{printf "%4d| %s\n", NR, $0}' apps/api/src/index.ts
awk 'NR>=1315 && NR<=1318{printf "%4d| %s\n", NR, $0}' apps/api/src/index.ts

sec "B1(b) mechanism · migrate() reads the migrations dir FROM DISK — packages/db/src/index.ts:767-796"
awk 'NR>=765 && NR<=796{printf "%4d| %s\n", NR, $0}' packages/db/src/index.ts

sec "B1(b) mechanism · does the C1 harness call migrate()? tests/support/testDatabase.ts:25-45"
awk 'NR>=25 && NR<=45{printf "%4d| %s\n", NR, $0}' tests/support/testDatabase.ts
echo "--- evaluator-database.test.ts:74 (the same migrate call) ---"
awk 'NR>=72 && NR<=76{printf "%4d| %s\n", NR, $0}' tests/integration/evaluator-database.test.ts

sec "N9 · the client's CODE: message prefix — packages/contract/src/client.ts:86-92"
awk 'NR>=86 && NR<=92{printf "%4d| %s\n", NR, $0}' packages/contract/src/client.ts

sec "N7 · the admission window apps/api/src/index.ts:1204-1231 (filter insertion point, consumers)"
awk 'NR>=1204 && NR<=1231{printf "%4d| %s\n", NR, $0}' apps/api/src/index.ts

sec "S02-C4-S1 case 2 · does :1293 contain planTier at base? (the plan says RED on the second half)"
grep -c 'planTier' apps/api/src/index.ts || true
echo "ASK_PLAN_TIER_MODEL_UNAVAILABLE anywhere: $(grep -rn 'ASK_PLAN_TIER_MODEL_UNAVAILABLE' apps packages tests acceptance | wc -l | tr -d ' ')"
echo "PLAN_TIER_ROSTERS anywhere in the lane: $(grep -rn 'PLAN_TIER_ROSTERS' apps packages tests 2>/dev/null | wc -l | tr -d ' ')"

sec "S02-M4's grep form (BRE escaped pipe) — the plan claims 8 lines on api.test.ts"
grep -n 'PLAN_TIER_ROSTERS\|PlanTier' tests/unit/api.test.ts | head -20
echo "count=$(grep -n 'PLAN_TIER_ROSTERS\|PlanTier' tests/unit/api.test.ts | wc -l | tr -d ' ')"

sec "R13 suite class grep (the -E form, safe)"
grep -rln -E 'evaluateAskAdmission|resolveDiscoveredPanel|panelSize' tests

sec "migrations dir · 0061 free?"
echo "count=$(ls migrations | wc -l | tr -d ' ')  highest=$(ls migrations | sort | tail -1)"
ls migrations | grep -c '^0061' || echo "0061 absent: OK"

sec "TOOLING-TRAPS · lane vs main line counts, and the four headings the plan cites"
echo "lane   $(wc -l < .hermes/TOOLING-TRAPS.md) lines"
echo "main   $(wc -l < $MAIN/.hermes/TOOLING-TRAPS.md) lines"
echo "--- lane: does it carry the standing-db bullet? ---"
grep -c 'standing-db.ts. adopts and MIGRATES' .hermes/TOOLING-TRAPS.md || echo "absent in lane"
echo "--- main: the standing-db bullet, verbatim ---"
grep -n 'standing-db.ts` adopts and MIGRATES' $MAIN/.hermes/TOOLING-TRAPS.md
echo "--- main: the heading it sits under ---"
grep -n '^## 2026-09-02 — orchestrator (war-plan session' $MAIN/.hermes/TOOLING-TRAPS.md
echo "--- the other three headings/bullets the plan cites, in the LANE ---"
grep -n 'A command that CRASHES exits nonzero too' .hermes/TOOLING-TRAPS.md | head -2
grep -n 'TWO TypeScript compilers' .hermes/TOOLING-TRAPS.md | head -2
grep -n 'psql. is NOT on this Mac' .hermes/TOOLING-TRAPS.md | head -2
grep -n '^## Codex workspace-write cannot reach' .hermes/TOOLING-TRAPS.md | head -2
grep -n '^## Claude Code Bash outputs over ~30 KB' .hermes/TOOLING-TRAPS.md | head -2
grep -n '^## The escaped pipe' .hermes/TOOLING-TRAPS.md | head -4

sec "done"
echo "### dirty AFTER $(git status --porcelain | wc -l | tr -d ' ')"
