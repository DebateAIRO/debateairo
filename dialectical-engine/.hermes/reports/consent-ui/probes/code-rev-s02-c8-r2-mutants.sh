#!/bin/bash
# CODE-REV-S02-C8-r2 — the reviewer's OWN round-2 mutants. Lane + scratch from argv (COMMON §10.35).
# Snapshot with cp, restore with cp, prove with diff -q (COMMON §10.44).
set -u
LANE="${1:?usage: rev-c8-r2-mutants.sh <lane> <scratch>}"; SC="${2:?}"
cd "$LANE" || exit 2
CSS=apps/ui/app/globals.css
TST=tests/unit/consent-s02-style-contract.test.ts
verdict() { pnpm exec vitest run "$TST" 2>&1 | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1; }
detail()  { pnpm exec vitest run "$TST" 2>&1 | grep -E 'AssertionError|to deeply equal|S02-S6' | grep -v '^ *$' | head -2; }
mutate() { # name file old new count expectation
  name="$1"; f="$2"; old="$3"; new="$4"; cnt="$5"; exp="$6"
  cp "$f" "$SC/MUT.snap"
  if ! python3 "$SC/mut.py" "$f" "$old" "$new" "$cnt"; then echo "$name | MUTANT NOT APPLIED"; cp "$SC/MUT.snap" "$f"; return; fi
  if diff -q "$f" "$SC/MUT.snap" >/dev/null; then echo "$name | DID NOT LAND"; cp "$SC/MUT.snap" "$f"; return; fi
  v=$(verdict); d=$(detail)
  case "$v" in *failed*) got=CAUGHT ;; *) got="NOT-caught" ;; esac
  echo "$name | expect=$exp got=$got |$v"
  [ -n "$d" ] && echo "      $(printf '%s' "$d" | tr '\n' '~')"
  cp "$SC/MUT.snap" "$f"
  diff -q "$f" "$SC/MUT.snap" >/dev/null && echo "      restored OK ($(verdict))" || echo "      RESTORE FAILED"
}
echo "### baseline: $(verdict)"

mutate "R1 ladder .70 expected 5.54 -> 5.61" "$TST" \
  'expect(ratiosAt(0.7)).toEqual(["Terracotta 5.54", "Chamber 8.09"]);' \
  'expect(ratiosAt(0.7)).toEqual(["Terracotta 5.61", "Chamber 8.09"]);' 1 CATCH

mutate "R2 composite Math.round -> Math.floor (the literal B1 bug)" "$TST" \
  '.map((value, index) => Math.round(alpha * value + (1 - alpha) * back[index]!).toString(16).padStart(2, "0"))' \
  '.map((value, index) => Math.floor(alpha * value + (1 - alpha) * back[index]!).toString(16).padStart(2, "0"))' 1 CATCH

mutate "R3 DELETE the four-selector focus rule (N1 discharge)" "$CSS" \
  '.consentPolicyLink:focus-visible,
.policyClose:focus-visible,
.policyPill:focus-visible,
.policyPrimary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
' '' 1 CATCH

mutate "R4 new ring var(--focus) -> var(--accent)" "$CSS" \
  '.policyPrimary:focus-visible {
  outline: 2px solid var(--focus);' \
  '.policyPrimary:focus-visible {
  outline: 2px solid var(--accent);' 1 CATCH

mutate "R5 .policyBody ring var(--focus) -> var(--accent)" "$CSS" \
  '.policyBody:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;' \
  '.policyBody:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;' 1 CATCH

mutate "R6 .consentBox ring var(--focus) -> var(--accent)" "$CSS" \
  '.consentBox:focus-visible {
  outline: 2px solid var(--focus);' \
  '.consentBox:focus-visible {
  outline: 2px solid var(--accent);' 1 CATCH

mutate "R7 ring on a NON-focusable selector (.policyTab)" "$CSS" \
  '.consentPolicyLink:focus-visible,
.policyClose:focus-visible,' \
  '.policyTab:focus-visible,
.consentPolicyLink:focus-visible,
.policyClose:focus-visible,' 1 CATCH

mutate "R9 transform: translateZ(0) on .authCard (S02-S65, above the block)" "$CSS" \
  '.authCard {
  width: 540px;' \
  '.authCard {
  transform: translateZ(0);
  width: 540px;' 1 CATCH

mutate "R10 colour literal inside the block (S02-S60)" "$CSS" \
  '.policyEyebrow {
  font-family: var(--font-mono);' \
  '.policyEyebrow {
  color: #A8823E;
  font-family: var(--font-mono);' 1 CATCH

mutate "R11 declared alpha .65 -> .60" "$CSS" '  opacity: .65;' '  opacity: .60;' 1 CATCH

mutate "R8 RE-DUPLICATE the gate-hint comment (N2 class; residual R1 says stripComments is blind)" "$CSS" \
  '/* --- Focus rings for the controls' \
  '/* The reason the button is disabled reaches assistive technology through `aria-describedby`
   and must NOT reach it as visible footer text. `display: none` and `visibility: hidden` both
   remove the element from the accessibility tree and take R15’s description with it, so this is
   the repo’s own `.srOnly` treatment. */

/* --- Focus rings for the controls' 1 "NOT-caught (residual R1 is real)"

echo "### final: $(verdict)"
rm -f "$SC/MUT.snap"
echo "### porcelain: [$(git status --porcelain)]"
