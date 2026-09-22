#!/bin/bash
# CODE-REV-S02-C8-r2 · B1 reproduction. Moves the DECLARED alpha in globals.css and its matching
# expectDecl together, raises the pinned threshold 4.5 -> 99 so the assertion PRINTS its received
# array, and neutralises the four hard-coded ladder rungs (they pin .60/.65/.70 regardless of the
# declared alpha, so they must not mask the print). Snapshot/restore by cp + diff -q (COMMON §10.44).
# Usage: rev-c8-r2-alpha-ladder.sh <lane> <scratchdir>
set -u
LANE="$1"; SC="$2"
cd "$LANE" || exit 9
CSS=apps/ui/app/globals.css
TST=tests/unit/consent-s02-style-contract.test.ts
cp "$CSS" "$SC/PRE-css"; cp "$TST" "$SC/PRE-tst"
for a in .60 .65 .70 .75; do
  cp "$SC/PRE-css" "$CSS"; cp "$SC/PRE-tst" "$TST"
  ch=$(grep -c "^  opacity: \.65;\$" "$CSS")
  perl -0pi -e "s/^  opacity: \.65;\$/  opacity: $a;/m" "$CSS"
  th=$(grep -c "expectDecl(\"\.policyPrimary:disabled\", \"opacity\", \"\.65\")" "$TST")
  perl -0pi -e "s/expectDecl\(\"\.policyPrimary:disabled\", \"opacity\", \"\.65\"\)/expectDecl(\".policyPrimary:disabled\", \"opacity\", \"$a\")/" "$TST"
  # threshold 4.5 -> 99 on the PINNED assertion only (line with ratiosAt(alpha))
  perl -0pi -e 's/ratiosAt\(alpha\)\.filter\(\(entry\) => Number\.parseFloat\(entry\.split\(" "\)\[1\]!\) < 4\.5\)/ratiosAt(alpha).filter((entry) => Number.parseFloat(entry.split(" ")[1]!) < 99)/' "$TST"
  # neutralise the three hard-coded rungs + the .60-must-fail property so they cannot mask the print
  perl -0pi -e 's/^\s*expect\(ratiosAt\(0\.6\)\)\.toEqual\(\[.*?\]\);$/    void 0;/m' "$TST"
  perl -0pi -e 's/^\s*expect\(ratiosAt\(0\.65\)\)\.toEqual\(\[.*?\]\);$/    void 0;/m' "$TST"
  perl -0pi -e 's/^\s*expect\(ratiosAt\(0\.7\)\)\.toEqual\(\[.*?\]\);$/    void 0;/m' "$TST"
  perl -0pi -e 's/ratiosAt\(0\.6\)\.some\(\(entry\) => Number\.parseFloat\(entry\.split\(" "\)\[1\]!\) < 4\.5\)/true/' "$TST"
  hits99=$(grep -c '< 99)' "$TST")
  echo "### alpha=$a  css-hits=$ch test-hits=$th threshold99-hits=$hits99  css-now=[$(grep -n '^  opacity: ' "$CSS" | grep -c "opacity: $a;")]"
  pnpm exec vitest run "$TST" 2>&1 | grep -E 'to deeply equal|AssertionError' | head -3
done
cp "$SC/PRE-css" "$CSS"; cp "$SC/PRE-tst" "$TST"
diff -q "$CSS" "$SC/PRE-css" >/dev/null && diff -q "$TST" "$SC/PRE-tst" >/dev/null && echo "RESTORED-OK"
echo "porcelain: [$(git status --porcelain)]"
