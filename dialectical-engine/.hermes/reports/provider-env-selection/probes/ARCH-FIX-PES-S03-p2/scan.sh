#!/bin/zsh
# ARCH-FIX-PES-S03-p2 · N3 — re-measure the rejected "throw new TypeError" scan of
# packages/providers/src/index.ts that DECISIONS.md (pass 1) recorded as "15 codes, 8 absent".
# Counts are taken by MACHINE (wc -l), never by eye. The pass-1 line-based grep is run beside a
# whole-text scan, and both are run on a two-throw fixture first so the line-based one is WATCHED
# missing a multi-line throw before its number is explained.
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine || exit 2
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2
FX=$P/scan-fixture.ts
printf '%s\n' 'throw new TypeError("ONE_LINE_CODE");' 'throw new TypeError(' '  `MULTI_LINE_CODE:${ref}`' ');' > $FX

line_scan() { /usr/bin/grep -oE 'throw new TypeError\((`|")[A-Z][A-Z0-9_]+' "$1" | /usr/bin/grep -oE '[A-Z][A-Z0-9_]{5,}' | sort -u; }
text_scan() { node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8");const s=new Set([...t.matchAll(/throw new TypeError\(\s*[`"]([A-Z][A-Z0-9_]{4,})/g)].map(m=>m[1]));console.log([...s].sort().join("\n"))' "$1"; }

echo "===== fixture: two throws, one of them split across lines ====="
echo "-- pass-1 line scan (expect it to MISS MULTI_LINE_CODE):"; line_scan $FX
echo "-- whole-text scan (expect both):"; text_scan $FX

F=packages/providers/src/index.ts
echo
echo "===== $F ====="
line_scan $F > $P/scan-line.txt; text_scan $F > $P/scan-text.txt
echo "pass-1 line scan  distinct: $(wc -l < $P/scan-line.txt | tr -d ' ')"
echo "whole-text scan   distinct: $(wc -l < $P/scan-text.txt | tr -d ' ')"
echo "-- in the whole-text scan, not in the line scan (and where it is thrown):"
comm -13 $P/scan-line.txt $P/scan-text.txt | while read -r c; do echo "   $c"; /usr/bin/grep -n "$c" $F | head -2 | sed 's/^/      /'; done

S11=$P/s11-base.txt
sed -n '/^## 11\. Providers and vendors/,$p' deploy/vps/README.md > $S11
: > $P/scan-absent.txt
while read -r c; do /usr/bin/grep -q "$c" $S11 || echo "$c" >> $P/scan-absent.txt; done < $P/scan-text.txt
echo
echo "absent from §11 (whole-text scan): $(wc -l < $P/scan-absent.txt | tr -d ' ')"
cat $P/scan-absent.txt | sed 's/^/   /'

echo
echo "===== the pass-1 '59 uppercase tokens' figure, re-run with its own command ====="
/usr/bin/grep -oE '(`|")[A-Z][A-Z0-9_]{5,}' $F | /usr/bin/grep -oE '[A-Z][A-Z0-9_]{5,}' | sort -u | wc -l | tr -d ' '
