#!/bin/zsh
# ARCH-FIX-PES-S03-p2 · every COUNT and POSITION oracle of the revised plan, as the LITERAL shell
# command the PLAN prints (only the README path is swapped for a snapshot), run with /usr/bin/grep
# and /usr/bin/sed at EACH STEP'S OWN BOUNDARY, on correct snapshots (must PASS) and on mutants and
# pass-1 patterns (must FAIL). Snapshots come from simulate.mjs (snap/*.md). Nothing touches the lane.
# SELFTEST=1 flips one expectation on purpose, to watch this checker FAIL before its PASS is quoted.
set -u
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2/snap
bad=0
check() { # label got want(exact)
  if [ "$2" = "$3" ]; then print -r -- "ok   $1  got=$2 want=$3"; else print -r -- "BAD  $1  got=$2 want=$3"; bad=$((bad+1)); fi
}
checkne() { # label got notwant — a mutant/old pattern must NOT produce the step's number
  if [ "$2" != "$3" ]; then print -r -- "ok   $1  got=$2 (must differ from $3)"; else print -r -- "BAD  $1  got=$2 equals $3"; bad=$((bad+1)); fi
}

# --- the literal commands (f = the README under test) ---
refusal_rows() { sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep -c '^|'; }
refusal_rows_OLD() { sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep -c '^| '; }
refusal_code() { sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep '^|' | /usr/bin/grep -c "$2"; }
member_rows() { sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^|'; }
member_rows_OLD() { sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^| '; }
example_line() { /usr/bin/grep '"input_price_micros_per_million":' "$1" | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c "/etc/debateai/$2/providers/acme.header"; }
input_price_whole_file() { /usr/bin/grep -c 'input_price_micros_per_million' "$1"; }
max_tokens_lines() { /usr/bin/grep -c 'max_tokens' "$1"; }
max_tokens_after_s11() { a=$(/usr/bin/grep -n 'max_tokens' "$1" | head -1 | cut -d: -f1); h=$(/usr/bin/grep -n '^## 11\. Providers and vendors' "$1" | cut -d: -f1); [ -n "$a" ] && [ "$a" -gt "$h" ] && echo yes || echo no; }
stale_bullets() { sed -n '/^## Known-stale sections/,/^---$/p' "$1" | /usr/bin/grep -c '^- '; }
window_bullets() { sed -n '14,40p' "$1" | /usr/bin/grep -c '^- '; }
window_removed_headlines() { sed -n '14,40p' "$1" | /usr/bin/grep -cE 'hosted provider target example|refusal-code table is incomplete'; }
six_all_after_s11() {
  h=$(/usr/bin/grep -n '^## 11\. Providers and vendors' "$1" | cut -d: -f1)
  /usr/bin/grep -nE 'PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED' "$1" | cut -d: -f1 | awk -v h="$h" '$1<=h{b++} END{ if ((b+0)==0) print "yes"; else print "no" }'
}

SIX=(PROVIDER_DISCOVERY_TARGET_PRICE_INVALID PROVIDER_TARGET_PRICE_REQUIRED PROVIDER_TARGET_PRICE_ZERO COST_ENVELOPE_POLICY_UNRESOLVED COST_ENVELOPE_POLICY_INVALID SUPPORT_ADMISSION_SCOPES_NOT_SEALED)

print "## known-hit proofs on the UNEDITED file (S0) — the pattern counts what it names before any step runs"
check "S0 refusal ^| (header+separator+11 rows)" "$(refusal_rows $D/S0.md)" 13
check "S0 member ^| (header+separator+4 rows)" "$(member_rows $D/S0.md)" 6
check "S0 example lines carrying both prices (runner)" "$(example_line $D/S0.md runner)" 0
check "S0 stale-list '- ' lines" "$(stale_bullets $D/S0.md)" 5
check "S0 max_tokens anywhere" "$(max_tokens_lines $D/S0.md)" 0

print "\n## B1.1 — C1-2 at ITS boundary (S1) and after C1-3 (S2)"
check "S1 refusal ^|  (revised pattern, number unchanged)" "$(refusal_rows $D/S1.md)" 19
check "S2 refusal ^|  (C1-3's sentence does not start with |)" "$(refusal_rows $D/S2.md)" 19
checkne "S1 refusal '^| ' — pass-1 pattern [reproduces B1.1]" "$(refusal_rows_OLD $D/S1.md)" 19
checkne "mutant: five rows added instead of six" "$(refusal_rows $D/B11_five.md)" 19
for c in $SIX; do check "S1 per-code table lines ≥1: $c" "$( [ $(refusal_code $D/S1.md $c) -ge 1 ] && echo yes || echo no )" yes; done
check "S0 per-code table lines = 0 for all six (the check is RED at base)" "$(for c in $SIX; do refusal_code $D/S0.md $c; done | awk '{s+=$1} END{print s+0}')" 0

member_first_cell() { sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c "^| \`$2\` |"; }
print "\n## C2-5's two first-cell commands (Revision 2 replaced 'C2-1's member-table half passes')"
check "S0 input first cell (RED at base)" "$(member_first_cell $D/S0.md input_price_micros_per_million)" 0
check "S0 output first cell (RED at base)" "$(member_first_cell $D/S0.md output_price_micros_per_million)" 0
check "S3a input first cell" "$(member_first_cell $D/S3a.md input_price_micros_per_million)" 1
check "S3a output first cell" "$(member_first_cell $D/S3a.md output_price_micros_per_million)" 1
check "S3b input first cell (prose variant B)" "$(member_first_cell $D/S3b.md input_price_micros_per_million)" 1
check "S3b output first cell (prose variant B)" "$(member_first_cell $D/S3b.md output_price_micros_per_million)" 1
checkne "mutant: output row missing" "$(member_first_cell $D/B12_one.md output_price_micros_per_million)" 1

print "\n## B1.2 — C2-5 at ITS boundary (S3a, S3b)"
check "S3a member ^|" "$(member_rows $D/S3a.md)" 8
check "S3b member ^| (prose variant B)" "$(member_rows $D/S3b.md)" 8
checkne "S3a member '^| ' — pass-1 pattern [reproduces B1.2]" "$(member_rows_OLD $D/S3a.md)" 8
checkne "mutant: one member row added instead of two" "$(member_rows $D/B12_one.md)" 8

print "\n## B1.3 — C2-6 at ITS boundary (S4a, S4b); C2-9 has not run, so bullet B1 (:20) is still there"
check "S4a runner line carries both prices" "$(example_line $D/S4a.md runner)" 1
check "S4a api line carries both prices" "$(example_line $D/S4a.md api)" 1
check "S4b runner line (prose variant B)" "$(example_line $D/S4b.md runner)" 1
check "S4b api line (prose variant B)" "$(example_line $D/S4b.md api)" 1
check "S3a runner line before C2-6 (RED)" "$(example_line $D/S3a.md runner)" 0
checkne "mutant: api line lost output price" "$(example_line $D/B13_noOut.md api)" 1
checkne "S4a whole-file count vs pass-1's 3 [reproduces B1.3]" "$(input_price_whole_file $D/S4a.md)" 3
check "S4a whole-file count (variant A) = 4, the 'minimal fix' number" "$(input_price_whole_file $D/S4a.md)" 4
checkne "S4b whole-file count vs the 'minimal fix' 4 [a correct edit fails it]" "$(input_price_whole_file $D/S4b.md)" 4

print "\n## class sweep — every other count/position oracle at its own boundary"
check "S5 max_tokens anywhere (before C2-8)" "$(max_tokens_lines $D/S5.md)" 0
check "S6 max_tokens anywhere (C2-8, acceptance step 6)" "$(max_tokens_lines $D/S6.md)" 1
check "S6 that line is below the §11 heading" "$(max_tokens_after_s11 $D/S6.md)" yes
check "S6 stale-list '- ' lines (before C2-9)" "$(stale_bullets $D/S6.md)" 5
check "S7 stale-list '- ' lines (C2-9)" "$(stale_bullets $D/S7.md)" 2
checkne "mutant: B3 kept" "$(stale_bullets $D/C29_keepB3.md)" 2
check "S7 §5 step 5: sed 14,40p '- ' lines" "$(window_bullets $D/S7.md)" 2
check "S7 §5 step 5: removed headlines in window" "$(window_removed_headlines $D/S7.md)" 0
check "S0 §5 step 5: removed headlines in window (RED at base)" "$(window_removed_headlines $D/S0.md)" 2
check "S7 §5 step 3: every hit of the six is below the §11 heading" "$(six_all_after_s11 $D/S7.md)" yes
check "S0 §5 step 3: (RED at base)" "$(six_all_after_s11 $D/S0.md)" no
check "S7 §5 step 4: a member-table hit" "$( [ $(sed -n '/^| Member | Value |$/,/^$/p' $D/S7.md | /usr/bin/grep -c 'input_price_micros_per_million') -ge 1 ] && echo yes || echo no)" yes
check "S7 §5 step 4: both example lines" "$(( $(example_line $D/S7.md runner) + $(example_line $D/S7.md api) ))" 2

if [ "${SELFTEST:-0}" = 1 ]; then
  print "\n## SELFTEST: a deliberately wrong expectation (the pass-1 number 3 for the C2-6 count) must make this checker FAIL"
  check "SELFTEST S4a whole-file count wanted 3" "$(input_price_whole_file $D/S4a.md)" 3
fi

print "\n$([ $bad -eq 0 ] && echo ORACLES_OK || echo ORACLES_FAIL) — $bad expectation(s) not met"
[ $bad -eq 0 ]
