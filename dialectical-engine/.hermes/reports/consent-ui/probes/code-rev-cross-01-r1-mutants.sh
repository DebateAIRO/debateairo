#!/bin/bash
# CODE-REV-CROSS-01 r1 — MY OWN mutants. Snapshot/restore with cp + diff -q (COMMON §10.44).
LANE="${1:?usage: mutants.sh <lane> <snapdir>}"
SNAP="${2:?usage: mutants.sh <lane> <snapdir>}"
cd "$LANE" || exit 2
MS=apps/ui/components/consent/modalSemantics.ts
CC=apps/ui/components/consent/CookieConsent.tsx

restore() {
  cp "$SNAP/modalSemantics.ts" "$MS"
  cp "$SNAP/CookieConsent.tsx" "$CC"
  diff -q "$MS" "$SNAP/modalSemantics.ts" >/dev/null && diff -q "$CC" "$SNAP/CookieConsent.tsx" >/dev/null \
    && echo "restore OK (tree: $(git status --porcelain | wc -l | tr -d ' ') entries)" \
    || { echo "RESTORE FAILED"; exit 9; }
}

names() {   # print PASS/FAIL by test NAME for the two suites (ASCII anchors only)
  pnpm exec vitest run tests/render/consent-modal-semantics.test.tsx tests/render/consent-policy-link.test.tsx 2>&1 \
    | grep -E '^[[:space:]]*(FAIL|Tests|Test Files)[[:space:]]' | sed 's/^[[:space:]]*//'
}

apply() { python3 - "$MS" "$1" <<'PY'
import sys
path, mode = sys.argv[1], sys.argv[2]
src = open(path).read()
ORIG = """      const survived = opener !== null && opener !== document.body && opener.isConnected;
      const named = surfaceRef.current.returnFocusRef?.current ?? null;
      if (survived) {
        focusElement(opener);
        return;
      }
      if (named !== null && named.isConnected) focusElement(named);"""
assert ORIG in src, "anchor block not found — mutant NOT applied"
if mode == "M1":   # the member is dead: the cleanup never consults returnFocusRef
    NEW = """      const survived = opener !== null && opener !== document.body && opener.isConnected;
      if (survived) {
        focusElement(opener);
        return;
      }"""
elif mode == "M2": # the isConnected guard on the named control is removed
    NEW = """      const survived = opener !== null && opener !== document.body && opener.isConnected;
      const named = surfaceRef.current.returnFocusRef?.current ?? null;
      if (survived) {
        focusElement(opener);
        return;
      }
      if (named !== null) focusElement(named);"""
elif mode == "M4": # the WORK PACKET's literal precedence (named-first), V-22's default wording
    NEW = """      const survived = opener !== null && opener !== document.body && opener.isConnected;
      const named = surfaceRef.current.returnFocusRef?.current ?? null;
      if (named !== null && named.isConnected) {
        focusElement(named);
        return;
      }
      if (survived) focusElement(opener);"""
else:
    raise SystemExit("unknown mode " + mode)
open(path, "w").write(src.replace(ORIG, NEW))
print("applied", mode)
PY
}

apply_m3() { python3 - "$MS" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
ORIG = "    const opener = document.activeElement as HTMLElement | null;"
assert ORIG in src, "capture line not found"
open(path, "w").write(src.replace(ORIG, "    const opener = null as HTMLElement | null;"))
print("applied M3 (capture skipped)")
PY
}

apply_m5() { python3 - "$CC" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
ORIG = "      chooseRef={manageRef}\n"
assert ORIG in src, "chooseRef prop not found"
open(path, "w").write(src.replace(ORIG, ""))
print("applied M5 (ref not passed to the bar)")
PY
}

for m in M1 M2 M4; do
  echo "############ MUTANT $m ############"
  apply "$m" || { echo "APPLY FAILED"; restore; continue; }
  names
  restore
  echo
done

echo "############ MUTANT M3 (capture skipped) ############"
apply_m3 && names
restore
echo

echo "############ MUTANT M5 (chooseRef not passed to the bar) ############"
apply_m5 && names
restore
echo
echo "############ CONTROL: unmutated HEAD ############"
names
echo "final tree: $(git status --porcelain | wc -l | tr -d ' ') entries"
