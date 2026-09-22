#!/bin/bash
# CODE-REV-S02-C8 r1 — the reviewer's OWN mutants. Snapshot with cp, restore with cp, prove with
# diff -q (COMMON §10.44). Lane from argv: ./rev-c8-mutants.sh <lane-root>
set -u
LANE="${1:?usage: rev-c8-mutants.sh <lane-root>}"
cd "$LANE" || exit 2
CSS=apps/ui/app/globals.css
SNAP=.review-scratch/mut.globals.snap
SPEC=tests/unit/consent-s02-style-contract.test.ts

verdict() { # prints the summary line only
  pnpm exec vitest run "$SPEC" 2>&1 | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1
}

mutate() { # name, python3 mutation expression on the whole file text
  name="$1"; shift
  cp "$CSS" "$SNAP"
  python3 - "$CSS" "$@" <<'PY'
import sys, io
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
t = io.open(path, encoding="utf-8").read()
n = t.count(old)
if n != 1:
    sys.stderr.write(f"ANCHOR NOT UNIQUE ({n}) for {old!r}\n"); sys.exit(3)
io.open(path, "w", encoding="utf-8").write(t.replace(old, new))
PY
  rc=$?
  if [ $rc -ne 0 ]; then echo "$name | MUTANT NOT APPLIED (anchor)"; cp "$SNAP" "$CSS"; return; fi
  if diff -q "$CSS" "$SNAP" >/dev/null; then echo "$name | MUTANT DID NOT LAND"; cp "$SNAP" "$CSS"; return; fi
  echo "$name | after mutant: $(verdict)"
  cp "$SNAP" "$CSS"
  diff -q "$CSS" "$SNAP" >/dev/null && echo "$name | restored: OK  ($(verdict))" || echo "$name | RESTORE FAILED"
}

echo "### baseline: $(verdict)"

# M1 — drop .policyBezel from the reduced-motion selector list (the packet's charge).
mutate "M1 drop .policyBezel from prefers-reduced-motion" \
  '  .policyScrim,
  .policyBezel {
    animation: none;' \
  '  .policyScrim {
    animation: none;'

# M2 — drop .policyScrim instead (the other half of the same class).
mutate "M2 drop .policyScrim from prefers-reduced-motion" \
  '  .policyScrim,
  .policyBezel {
    animation: none;' \
  '  .policyBezel {
    animation: none;'

# M3 — a THIRD animated selector added with no reduced-motion entry.
mutate "M3 add an uncovered animated selector" \
  '.policyCore {
  position: relative;' \
  '.policyCore {
  animation: consentPolicyCardIn 180ms ease both;
  position: relative;'

# M4 — S02-S65 standing guard: a transform on .authCard (above the block).
mutate "M4 transform on .authCard (S02-S65)" \
  '.authCard {
  position: relative;' \
  '.authCard {
  transform: translateZ(0);
  position: relative;'

# M5 — geometry: the modal width clamp.
mutate "M5 width clamp 680 -> 720" \
  'width: min(680px, calc(100vw - 32px));' \
  'width: min(720px, calc(100vw - 32px));'

# M6 — checkbox square 17px -> 16px.
mutate "M6 .consentBox width 17px -> 16px" \
  '  width: 17px;
  height: 17px;' \
  '  width: 16px;
  height: 17px;'

# M7 — the hairline moved off the first row onto every row.
mutate "M7 hairline on every .consentRow" \
  '.consentGroup > .consentRow:first-child {' \
  '.consentGroup > .consentRow {'

# M8 — .policyGateHint given display:none (the R15 accessibility-tree removal).
mutate "M8 .policyGateHint display:none" \
  '.policyGateHint {
  position: absolute;' \
  '.policyGateHint {
  display: none;
  position: absolute;'

# M9 — the disabled opacity dropped to .60 (below 4.5:1 in Terracotta).
mutate "M9 disabled opacity .65 -> .60" \
  '  opacity: .65;' \
  '  opacity: .60;'

# M10 — a colour literal inside the block (S02-S60).
mutate "M10 colour literal inside the block" \
  '  background: var(--gold);' \
  '  background: #A8823E;'

echo "### final porcelain: $(git status --porcelain | wc -l | tr -d ' ') entries"
rm -f "$SNAP"
