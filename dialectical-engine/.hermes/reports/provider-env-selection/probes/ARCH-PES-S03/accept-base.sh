#!/bin/zsh
# ARCH-PES-S03 · SPEC §5's acceptance steps 3-7 run AT BASE, before any edit.
# Purpose: (a) record each step's base answer so the plan states what must change,
#          (b) prove every NEGATIVE assertion is capable of FAILING (TOOLING-TRAPS
#              "Variant 6: an acceptance pinned to ABSOLUTE LINE NUMBERS" :329),
#          (c) prove each published grep under BOTH binaries on this Mac
#              (TOOLING-TRAPS "grep on this Mac is TWO binaries" :3023).
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2

SIX='PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED'

echo "===== which grep ====="
command -v grep; /usr/bin/grep --version 2>&1 | head -1

echo
echo "===== STEP 3 (six codes) — /usr/bin/grep -nE ====="
/usr/bin/grep -nE "$SIX" deploy/vps/README.md
echo "-- line numbers only, sorted --"
/usr/bin/grep -nE "$SIX" deploy/vps/README.md | cut -d: -f1 | sort -n | tr '\n' ' '; echo
echo "-- §11 body starts at line --"
/usr/bin/grep -n '^## 11\.' deploy/vps/README.md

echo
echo "===== STEP 3 KNOWN-HIT proof (the pattern is not empty by construction) ====="
printf 'PROVIDER_TARGET_PRICE_REQUIRED\nPROVIDER_TARGET_PRICE_ZERO\nPROVIDER_DISCOVERY_TARGET_PRICE_INVALID\nCOST_ENVELOPE_POLICY_UNRESOLVED\nCOST_ENVELOPE_POLICY_INVALID\nSUPPORT_ADMISSION_SCOPES_NOT_SEALED\nNOT_A_CODE\n' > /tmp/pes-s03-knownhit.txt
echo "expect 6 of 7 lines:"; /usr/bin/grep -cE "$SIX" /tmp/pes-s03-knownhit.txt

echo
echo "===== STEP 4 (price members) ====="
/usr/bin/grep -n 'input_price_micros_per_million' deploy/vps/README.md

echo
echo "===== STEP 5 (known-stale list, sed 14,40p) — bullet headlines only ====="
/usr/bin/sed -n '14,40p' deploy/vps/README.md | /usr/bin/grep -n '^- ' || echo "(no bullets in range)"

echo
echo "===== STEP 6 (cost paragraph) ====="
/usr/bin/grep -n 'max_tokens' deploy/vps/README.md || echo "rc=$? — NO HIT at base (this is what R3.6 must change)"

echo
echo "===== STEP 7 (no product file moved) — the NEGATIVE assertion ====="
echo "-- as SPEC §5 step 7 writes it, from the lane's dialectical-engine/ dir --"
git diff --stat origin/dev...HEAD -- apps packages
echo "   rc=$? (empty output = pass)"
echo "-- CAPABILITY PROOF: the same command against a range that DID move apps/ --"
echo "   (origin/dev...origin/dev~200 is a throwaway range; a non-empty stat proves"
echo "    the pathspec resolves and the assertion can fail rather than passing vacuously)"
git diff --stat origin/dev~200...origin/dev -- apps packages | tail -3
echo "-- and the git-root-relative spelling that TOOLING-TRAPS :873 says matches NOTHING --"
git diff --stat origin/dev~200...origin/dev -- dialectical-engine/apps | tail -3
echo "   (empty above = the trap reproduced; the SPEC's relative spelling is the correct one)"
