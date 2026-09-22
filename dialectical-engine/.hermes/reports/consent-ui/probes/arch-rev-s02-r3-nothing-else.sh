#!/bin/bash
export LC_ALL=C
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
P=docs/missions/consent-ui/slices/S02/PLAN.md
echo "=== A. WHERE this round touched the PLAN (its own markers) ==="
echo "lines carrying 'ARCH-REV-S02-r2' or 'V-18' or 'REWORK-R2':"
grep -n 'ARCH-REV-S02-r2\|V-18\|ARCH-S02-REWORK-R2\|rework round 2' $P | cut -c1-110
echo
echo "=== B. the round-2 verdict's own pins, re-checked verbatim ==="
echo -n "B1 aria-label literal (N4)             : "; grep -c 'getAttribute("aria-label") === "Privacy Policy text"' $P
echo -n "the mirror-arm block, stated once      : "; grep -c '^> \*\*Mirror arm:\*\*' $P
echo -n "member-1 settled-mirror expression     : "; grep -c 'setPrivacyMirror(event.currentTarget.checked && !event.nativeEvent.defaultPrevented)' $P
echo -n "member-2 resync expression             : "; grep -c 'setPrivacyMirror(privacyInputRef.current?.checked ?? false)' $P
echo -n "RUNNING-is-not-WRITING paragraph       : "; grep -c 'RUNNING a test file is not WRITING it' $P
echo -n "standing gates NOT folded into guard   : "; grep -c 'deliberately NOT folded into the guard' $P
echo -n "S02-S69 UNVERIFIED path (N5)           : "; grep -c 'UNVERIFIED' $P
echo -n "S02-S28 trailing judgement clause (N5) : "; grep -c 'and it reads as one control' $P
echo -n "G1 monotone-delta fingerprint arm      : "; grep -c "grep -cE '\^\\\\\$ tsc --noEmit\\\$'" $P
echo -n "G2 hit-list count arm                  : "; grep -c 'hit list counted at exactly 1' $P
echo -n "chain rule table present               : "; grep -c 'THE CHAIN RULE, new in rework round 1' $P
echo -n "C5->C6 second chain paragraph          : "; grep -c 'The class has a SECOND chain' $P
echo -n "three-run law                          : "; grep -c 'Green-green-red is RED' $P
echo -n "banned-words ban statement             : "; grep -c 'Banned in any step or acceptance criterion' $P
echo
echo "=== C. banned-word scan (mine) ==="
echo -n "improve|better|robust|handle|appropriate hits : "; grep -cEi 'improve|better|robust|handle|appropriate' $P
echo -n "  of which handler/HANDLER as a noun          : "; grep -oEi 'improve|better|robust|handler|handle|appropriate' $P | sort | uniq -c | tr '\n' ' '
echo
echo
echo "=== D. surfaces: does any step name a file outside the slice? ==="
grep -oE '(apps|tests|docs|packages)/[A-Za-z0-9_./-]+' $P | sort -u | grep -vE 'consent|SignUpFlow|auth-flow-integration|v2ui-node-runner|t9-mode-tokens|globals.css|privacyPolicy|modalSemantics|auth-front-door-parity|s14-ui|architecture/01-decisions|missions/consent-ui|superpowers/plans'
echo "(empty above = every path named is inside the slice's declared surface or a named gate)"
echo
echo "=== E. the other slice's files and the COMMON §3 no-touch surface ==="
for pat in 'ConsentBanner' 'consentStorage' 'cookie' 'localStorage' 'app/api' 'middleware.ts'; do
  printf '  %-16s : %s\n' "$pat" "$(grep -c "$pat" $P)"
done
echo
echo "=== F. modalSemantics exported-surface block vs S01's copy ==="
sed -n '162,172p' $P | md5 -q
sed -n '495,505p' docs/missions/consent-ui/slices/S01/PLAN.md | md5 -q
sed -n '162,172p' $P | head -3
