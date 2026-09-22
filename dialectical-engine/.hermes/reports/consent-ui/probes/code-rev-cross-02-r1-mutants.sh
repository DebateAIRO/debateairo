#!/bin/bash
# CODE-REV-CROSS-02 r1 — mutant harness. Snapshot with cp, restore with cp, verify with diff -q
# (COMMON 10.44: never `git checkout --`). Lane from argv, never hard-coded.
set -u
LANE="$1"; S="$2"
cd "$LANE" || exit 9
F=apps/ui/components/consent/modalSemantics.ts
cp "$F" "$S/modalSemantics.HEAD.snapshot.ts" || exit 9

AUTHOR_FILES="tests/render/consent-cross-slice.test.tsx tests/render/consent-modal-semantics.test.tsx tests/render/consent-policy-link.test.tsx"

summarize() {  # $1 = label
  out=$(pnpm exec vitest run $AUTHOR_FILES 2>&1)
  sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  names=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*(FAIL|.{1,3})[[:space:]]*tests/render/.*> ' | grep -E 'FAIL' | sed 's/^[[:space:]]*//' | sort -u)
  echo "AUTHOR-SUITES [$1] |$sum |$fil"
  [ -n "$names" ] && printf '  failing: %s\n' "$names"
  pout=$(LANE="$LANE" pnpm exec vitest run --config "$S/probe-runner.config.ts" 2>&1)
  psum=$(printf '%s\n' "$pout" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  pnames=$(printf '%s\n' "$pout" | grep -E 'FAIL|AssertionError' | sed 's/^[[:space:]]*//' | head -12)
  echo "REVIEWER-PROBE [$1] |$psum"
  [ -n "$pnames" ] && printf '  probe-fail: %s\n' "$pnames"
  printf '%s\n' "$pout" | grep -E '^R[0-9] |^R4 |^R7 ' | head -5
}

echo "############ CONTROL: HEAD, unmutated ############"
summarize HEAD

for M in FIFO NOCONN NEIGHBOUR; do
  echo
  echo "############ MUTANT $M ############"
  python3 "$S/mutate.py" "$M" "$F" || { echo "MUTATE FAILED"; continue; }
  summarize "$M"
  cp "$S/modalSemantics.HEAD.snapshot.ts" "$F"
  if diff -q "$S/modalSemantics.HEAD.snapshot.ts" "$F" >/dev/null; then echo "restored $M: diff -q clean"; else echo "RESTORE FAILED $M"; exit 9; fi
done

echo
echo "############ MUTANT BASE-DOCORDER (bd314084's whole helper planted back) ############"
git show bd314084:dialectical-engine/apps/ui/components/consent/modalSemantics.ts > "$F"
summarize BASE-DOCORDER
cp "$S/modalSemantics.HEAD.snapshot.ts" "$F"
diff -q "$S/modalSemantics.HEAD.snapshot.ts" "$F" >/dev/null && echo "restored BASE-DOCORDER: diff -q clean" || { echo "RESTORE FAILED"; exit 9; }

echo
echo "############ final porcelain ############"
git status --porcelain | sed 's/^/  /'
echo "(empty above = tree clean)"
