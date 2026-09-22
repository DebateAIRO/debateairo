#!/bin/bash
# ARCH-S02-REWORK-R2 — B3's discharge, run from a .sh under /bin/bash with LC_ALL=C
# (COMMON.md §10.16: the tool shell's grep is a ugrep shim under UTF-8; a script gets BSD grep
#  in the C locale, where '.' matches ONE BYTE — so every anchor here is pure ASCII and no term
#  matches a multi-byte glyph). Run: /bin/bash .hermes/reports/consent-ui/probes/arch-s02-rework-r2-b3.sh
set -u
export LC_ALL=C
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 2
echo "### grep in use: $(grep --version 2>&1 | head -1)"
echo "### LC_ALL=$LC_ALL   node: $(node --version)"

FIXED=.hermes/reports/consent-ui/probes/arch-s02-rework-r2-r17-post-c7-fixed.mjs
ORIG=.hermes/reports/consent-ui/probes/arch-rev-s02-r2-r17-post-c7.mjs
ALTS=.hermes/reports/consent-ui/probes/arch-s02-rework-r2-alternatives.mjs

verdict=0
for i in 1 2 3; do
  out=$(node "$FIXED" 2>&1); rc=$?
  c7=$(printf '%s\n' "$out" | grep -c '^  ---- STAGE c7: 6/6 pass, 0 FAIL$')
  c4=$(printf '%s\n' "$out" | grep -c '^  ---- STAGE c4: 4/6 pass, 2 FAIL$')
  nm=$(printf '%s\n' "$out" | grep -c 'NO MODAL AT THIS STAGE')
  echo "FIXED  run $i | exit=$rc | 'STAGE c7: 6/6 pass, 0 FAIL'=$c7 (expect 1) | 'STAGE c4: 4/6 pass, 2 FAIL'=$c4 (expect 1) | 'NO MODAL AT THIS STAGE' lines=$nm (expect 2)"
  [ "$rc" = 0 ] && [ "$c7" = 1 ] && [ "$c4" = 1 ] && [ "$nm" = 2 ] || verdict=1
done

# RED control: the reviewer's UNTOUCHED probe must still show cases 4/5 failing at STAGE c7.
for i in 1 2 3; do
  out=$(node "$ORIG" 2>&1); rc=$?
  red=$(printf '%s\n' "$out" | grep -c '^  ---- STAGE c7: 4/6 pass, 2 FAIL$')
  echo "RED-CTL run $i | exit=$rc | untouched original 'STAGE c7: 4/6 pass, 2 FAIL'=$red (expect 1)"
  [ "$rc" = 0 ] && [ "$red" = 1 ] || verdict=1
done

for i in 1 2 3; do
  out=$(node "$ALTS" 2>&1); rc=$?
  a2=$(printf '%s\n' "$out" | grep -c 'ALT-2 literal-case-4 rule : bare click ticked box=true btnDisabled=false acknowledgements=0 register()=1')
  a3=$(printf '%s\n' "$out" | grep -c 'ALT-3 assignment-only route: btnDisabled=true')
  rw=$(printf '%s\n' "$out" | grep -c 'RESET with reset          : firstHalfDisabled=true route=ACKNOWLEDGED btnDisabled=false')
  rn=$(printf '%s\n' "$out" | grep -c 'RESET without reset       : adultCheckedAfterClick=false route=ACKNOWLEDGED btnDisabled=true')
  echo "ALTS   run $i | exit=$rc | ALT-2=$a2 ALT-3=$a3 RESETwith=$rw RESETwithout=$rn (each expect 3)"
  [ "$rc" = 0 ] && [ "$a2" = 3 ] && [ "$a3" = 3 ] && [ "$rw" = 3 ] && [ "$rn" = 3 ] || verdict=1
done

# --- the guard proved SATISFIABLE and DISCRIMINATING on synthetic input (COMMON §10.16 b/c) ---
echo "-- known-GOOD synthetic: the exact line the guard wants --"
printf '  ---- STAGE c7: 6/6 pass, 0 FAIL\n' | grep -c '^  ---- STAGE c7: 6/6 pass, 0 FAIL$'
echo "-- MUTANT 1: 5/6 (one case regressed) --"
printf '  ---- STAGE c7: 5/6 pass, 1 FAIL\n' | grep -c '^  ---- STAGE c7: 6/6 pass, 0 FAIL$'
echo "-- MUTANT 2: the c4 stage silently going 6/6 again (cases not actually moved) --"
printf '  ---- STAGE c4: 6/6 pass, 0 FAIL\n' | grep -c '^  ---- STAGE c4: 4/6 pass, 2 FAIL$'
echo "-- MUTANT 3: the word STAGE inside a test TITLE, not anchored --"
printf 'PASS  a case about STAGE c7: 6/6 pass, 0 FAIL\n' | grep -c '^  ---- STAGE c7: 6/6 pass, 0 FAIL$'

# --- N6: the sweep claim, with the command that proves it -------------------------------------
# Counting rule: lines mentioning :324/:448/:466 that carry NO qualifier marking the number as a
# reading aid rather than an edit instruction. Target 0. The RAW count is reported, not asserted.
QUAL='reading aid\|pre-edit\|base position\|measured at base\|grep \|printf '
P=docs/missions/consent-ui/slices/S02/PLAN.md
n6=$(grep -n ':324\|:448\|:466' "$P" | grep -c -v "$QUAL")
n6raw=$(grep -c ':324\|:448\|:466' "$P")
echo "-- N6 unqualified pre-edit positions in PLAN.md: $n6 (expect 0) | raw occurrences: $n6raw (reported) --"
grep -n ':324\|:448\|:466' "$P" | grep -v "$QUAL"
echo "-- N6 guard DISCRIMINATES: fed the boundary row's old text (expect 1) --"
printf 'auth-flow-integration.test.tsx (three inserted lines at :324, :448, :466 and nothing else)\n' \
  | grep ':324\|:448\|:466' | grep -c -v "$QUAL"
[ "$n6" = 0 ] || verdict=1
echo "-- N6: the C3 boundary row now carries the step anchor (expect 1) --"
grep -c 'one after each occurrence of `field("adult-affirmed").checked = true;`' "$P"

# --- ADR renumbering ---------------------------------------------------------------------------
# The charge is "every ADR-0020 REFERENCE becomes ADR-0022-shared-modal-semantics.md": 8 before.
# What must be 0 is references to the FILE ADR-0020-shared-modal-semantics.md. The one surviving
# 'ADR-0020' is the prose naming the two ids the translation mission reserves, which must survive.
adr20file=$(grep -c 'ADR-0020-shared-modal-semantics' "$P")
adr20any=$(grep -c 'ADR-0020' "$P")
adr22file=$(grep -c 'ADR-0022-shared-modal-semantics.md' "$P")
echo "-- ADR: file refs 'ADR-0020-shared-modal-semantics'=$adr20file (expect 0) | any 'ADR-0020'=$adr20any (expect 1, the reservation note) | 'ADR-0022-shared-modal-semantics.md'=$adr22file (expect 9: the 8 renamed + 1 in the correction paragraph) --"
grep -n 'ADR-0020' "$P"
[ "$adr20file" = 0 ] && [ "$adr20any" = 1 ] && [ "$adr22file" = 9 ] || verdict=1
G=.hermes/reports/consent-ui/mission-graph-S02.md
g20file=$(grep -c 'ADR-0020-shared-modal-semantics' "$G")
g22file=$(grep -c 'ADR-0022-shared-modal-semantics.md' "$G")
echo "-- ADR in the mission graph: file refs 'ADR-0020-shared-modal-semantics'=$g20file (expect 0) | 'ADR-0022-shared-modal-semantics.md'=$g22file (expect 2) --"
grep -n 'ADR-00' "$G" | cut -c1-90
[ "$g20file" = 0 ] && [ "$g22file" = 2 ] || verdict=1

# --- the trace probe, re-run: the counts B3 moved -----------------------------------------------
echo "-- trace probe, re-run --"
python3 .hermes/reports/consent-ui/probes/arch-rev-s02-trace.py 2>&1 | sed -n '/steps per cluster/,/total:/p'
echo "-- UNDEFINED step references in DECISIONS (expect 0) --"
python3 .hermes/reports/consent-ui/probes/arch-rev-s02-trace.py 2>&1 | grep -c '<UNDEFINED>'
echo "-- frozen SPEC md5 (expect ad060bda81db71f00f4c70b1dbf63f2f) --"
md5 -q docs/missions/consent-ui/slices/S02/SPEC.md

echo "### VERDICT=$verdict  (0 = every arm satisfied)"
exit $verdict
