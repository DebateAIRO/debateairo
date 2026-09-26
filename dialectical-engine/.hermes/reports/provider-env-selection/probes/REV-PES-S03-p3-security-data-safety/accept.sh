#!/bin/zsh
# REV-PES-S03-p3-security-data-safety — SPEC-v3 §5 steps 2-7 end to end at the rebased head, plus the
# pass-3 measurements: both refusal tables (R3.3 + V-8), COST_ENVELOPES_NOT_SEALED line count (R3.4b),
# credential-file contract byte-identity vs base, and step 7 against BOTH the literal origin/dev and a6d6382ba.
# usage: zsh accept.sh [WORKTREE]
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:-${WORKTREE:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine}}"
BASE=a6d6382ba
cd "$WT" || exit 2
R=deploy/vps/README.md
echo "HEAD $(git rev-parse --short HEAD) origin/dev $(git rev-parse --short origin/dev) base $BASE"
S11=$(/usr/bin/grep -n '^## 11\. ' $R | cut -d: -f1); T1=$(/usr/bin/grep -n '^### What the hosted mode refuses, in code' $R | cut -d: -f1)
T1E=$(/usr/bin/grep -n '^### The credential-file contract' $R | cut -d: -f1); S12=$(/usr/bin/grep -n '^## 12\. ' $R | cut -d: -f1)
PUB=$(/usr/bin/grep -n '^| Refusal code | Meaning |' $R | cut -d: -f1)
echo "§11=$S11 table1=$T1..$T1E publisher-table=$PUB §12=$S12"
echo "== STEP 2"; pnpm exec vitest run tests/unit/v9-provider-credential-files.test.ts tests/architecture/vps-deployment-baseline.test.ts 2>&1 | /usr/bin/grep -E '^\s*(Test Files|Tests) '
echo "== STEP 3"; /usr/bin/grep -nE 'PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED' $R | cut -c1-110
echo "-- six codes: first-column row in table1 ($T1..$T1E)?"
for c in PROVIDER_TARGET_PRICE_REQUIRED PROVIDER_TARGET_PRICE_ZERO PROVIDER_DISCOVERY_TARGET_PRICE_INVALID COST_ENVELOPE_POLICY_UNRESOLVED COST_ENVELOPE_POLICY_INVALID SUPPORT_ADMISSION_SCOPES_NOT_SEALED; do
  l=$(awk -v a=$T1 -v b=$T1E -v c="$c" 'NR>a && NR<b && index($0,"| `" c)==1 {print NR}' $R | tr '\n' ' ')
  p=$(awk -v a=$PUB -v c="$c" 'NR>a && /^\|/ {split($0,f,"|"); if (index(f[2],c)) print NR} NR>a && !/^\|/ && NR>a+1 {exit}' $R | tr '\n' ' ')
  echo "$c table1-row:[$l] publisher-first-col:[$p]"; done
echo "== V-8 run-time spend codes anywhere in either table (expect none)"
for c in RUN_COST_ENVELOPE_MONEY_REACHED PROVIDER_USAGE_UNREPORTED COST_ENVELOPE_CHARGE_UNREPRESENTABLE DAILY_COST_ENVELOPE_REACHED; do
  echo "$c table1:$(awk -v a=$T1 -v b=$T1E -v c="$c" 'NR>a&&NR<b&&index($0,c)' $R | wc -l | tr -d ' ') publisher:$(awk -v a=$PUB -v c="$c" 'NR>a && /^\|/ && index($0,c)' $R | wc -l | tr -d ' ') whole-README:$(/usr/bin/grep -c "$c" $R)"; done
echo "-- source of the four: $(git grep -n 'PROVIDER_COST_ENVELOPE_REFUSAL_CODES = ' -- packages/providers/src/index.ts | cut -c1-90)"
echo "== table1 heading still says: $(sed -n "${T1}p" $R)"
echo "== STEP 4"; /usr/bin/grep -n 'input_price_micros_per_million' $R | cut -c1-120
echo "== STEP 5 (sed 14,40p, bullets and stale strings)"; sed -n '14,40p' $R | /usr/bin/grep -nE '^- |Known-stale|hosted provider target example|refusal-code table is incomplete' | cut -c1-120; echo "(end step 5)"
echo "== STEP 6"; /usr/bin/grep -n 'max_tokens' $R | cut -c1-140
echo "== STEP 7 literal origin/dev"; git diff --stat origin/dev...HEAD -- apps packages | tail -3; echo "rc=$? (empty=pass)"
echo "== STEP 7 vs base $BASE"; git diff --stat $BASE...HEAD -- apps packages | tail -3; echo "(empty=pass)"
echo "== STEP 7 capability"; git diff --stat 776359c3...$BASE -- apps packages | tail -1
echo "== R3.4b grep"; /usr/bin/grep -n COST_ENVELOPES_NOT_SEALED $R | cut -c1-80
echo "== credential-file contract section sha (base vs head)"
sec(){ awk '/^### The credential-file contract/{f=1} /^### Adding a vendor/{f=0} f'; }
echo "base $(git show $BASE:dialectical-engine/$R | sec | shasum | cut -c1-12) head $(sec < $R | shasum | cut -c1-12)"
echo "== §3 custody (## 3. .. ## 4.) sha"; s3(){ awk '/^## 3\. /{f=1} /^## 4\. /{f=0} f'; }
echo "base $(git show $BASE:dialectical-engine/$R | s3 | shasum | cut -c1-12) head $(s3 < $R | shasum | cut -c1-12)"
echo "== diff names"; git diff --name-only $BASE...HEAD
echo "dirty $(git status --porcelain | wc -l | tr -d ' ')"
