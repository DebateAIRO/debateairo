#!/bin/zsh
# ARCH-FIX-PES-S03-p3 · C1-2's two literal commands (PLAN C1-2 "Done when", unchanged by Revision 3)
# on the README states gate.mjs built from REVISION 3's texts (states-rev3/): the new row-1 and row-6
# cells and the new sentence must leave the counts where C1-2 says. SELFTEST=1 plants a false 18.
set -u
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p3/states-rev3
bad=0
check() { if [ "$2" = "$3" ]; then print -r -- "ok   $1  got=$2 want=$3"; else print -r -- "BAD  $1  got=$2 want=$3"; bad=$((bad+1)); fi; }
rows() { sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep -c '^|'; }
code() { sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep '^|' | /usr/bin/grep -c "$2"; }
check "S0 refusal ^| lines (base)" "$(rows $D/S0.md)" 13
check "S1 refusal ^| lines (Revision 3 rows)" "$(rows $D/S1.md)" 19
check "S2 refusal ^| lines (+ sentence)" "$(rows $D/S2.md)" 19
check "S2w refusal ^| lines (+ wrapped sentence)" "$(rows $D/S2w.md)" 19
for c in PROVIDER_DISCOVERY_TARGET_PRICE_INVALID PROVIDER_TARGET_PRICE_REQUIRED PROVIDER_TARGET_PRICE_ZERO COST_ENVELOPE_POLICY_UNRESOLVED COST_ENVELOPE_POLICY_INVALID SUPPORT_ADMISSION_SCOPES_NOT_SEALED; do
  check "S1 per-code table lines >= 1: $c" "$( [ $(code $D/S1.md $c) -ge 1 ] && echo yes || echo no )" yes
done
if [ "${SELFTEST:-0}" = 1 ]; then check "SELFTEST S2 wanted 18" "$(rows $D/S2.md)" 18; fi
print "\n$([ $bad -eq 0 ] && echo ORACLES_P3_OK || echo ORACLES_P3_FAIL) — $bad not met"
[ $bad -eq 0 ]
