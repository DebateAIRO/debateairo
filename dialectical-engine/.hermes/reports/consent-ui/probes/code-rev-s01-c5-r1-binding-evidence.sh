#!/bin/bash
# CODE-REV-S01-C5 r1 — the two measurements that make B1's coverage gap BINDING,
# plus the N7 compile-pin mutant. Lane from argv (COMMON §10.35).
LANE="${1:-${LANE:-$PWD}}"
cd "$LANE" || exit 99
CC=apps/ui/components/consent/CookieConsent.tsx
CONSENT=apps/ui/lib/consent.ts
P="$LANE/.review-scratch/pristine2"
mkdir -p "$P"
cp "$CC" "$P/cc.orig"; cp "$CONSENT" "$P/consent.orig"

runc5 () {
out=$(pnpm exec vitest run tests/render/consent-mount.test.tsx tests/render/t3-library.test.tsx tests/render/t9-landing.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
PIN='renders recased native selectors and a live count for the four Your debates rows|renders a live count for the three Public debates rows|renders every library row as a shell/core bezel|renders the public search-indexing disclosure once under the list and never on Yours'
KEEP='keeps the real layout TopBar as a direct appShell child|pins the real signed-in render to zero landing markers'
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_newfail=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*FAIL[[:space:]]' | grep -cvE "> ($PIN)\$")
n_keep=$(printf '%s\n' "$out" | grep -cE "tests/render/t3-library\.test\.tsx > chrome > ($KEEP)( [0-9]+ms)?\$")
n_keepfail=$(printf '%s\n' "$out" | grep -cE "^[[:space:]]*FAIL[[:space:]].*> ($KEEP)\$")
n_mount=$(printf '%s\n' "$out" | grep -cE 'tests/render/consent-mount\.test\.tsx > ')
n_mountfail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]+tests/render/consent-mount\.test\.tsx > ')
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -le 1 ] \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+.*\(3\)$' \
  && [ "$n_newfail" -eq 0 ] \
  && [ "$n_keep" -eq 2 ] && [ "$n_keepfail" -eq 0 ] \
  && [ "$n_mount" -ge 1 ] && [ "$n_mountfail" -eq 0 ] \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "  CMD-C5 verdict=$?  summary:$sum  files:$files  unpinned-failures:$n_newfail  consent-mount failing:$n_mountfail"
}

echo "=== A. CMD-C5 on the SHIPPED code (control) ==="
runc5

echo
echo "=== B. CMD-C5 with the DISMISSAL keyed on presence, not validity (RM2) ==="
python3 - "$CC" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old='  const dismiss = useCallback((): void => {\n    setSurface(readConsent() === null ? "bar" : "silent");'
new='  const dismiss = useCallback((): void => {\n    setSurface(localStorage.getItem("debateai.consent") === null ? "bar" : "silent");'
assert s.count(old)==1, "anchor"
open(p,"w").write(s.replace(old,new,1))
PY
runc5
cp "$P/cc.orig" "$CC"

echo
echo "=== C. CMD-C5 with the MOUNT keyed on presence, not validity (RM3) ==="
python3 - "$CC" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old='    setSurface(readConsent() === null ? "bar" : "silent");\n  }, []);\n\n  /**\n   * Opening the card'
new='    setSurface(localStorage.getItem("debateai.consent") === null ? "bar" : "silent");\n  }, []);\n\n  /**\n   * Opening the card'
assert s.count(old)==1, "anchor"
open(p,"w").write(s.replace(old,new,1))
PY
runc5
cp "$P/cc.orig" "$CC"

echo
echo "=== D. THE N7 COMPILE PIN — apps/ui tsc with the save-choices overload LOOSENED ==="
echo "--- D0 shipped (control) ---"
( cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -3; echo "APPSUI_TSC_EXIT=${PIPESTATUS[0]}" )
( cd apps/ui && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1; echo "APPSUI_TSC_EXIT=$?" )
echo "--- D1 the save-choices overload made toggles-OPTIONAL (the regression the pin exists to see) ---"
python3 - "$CONSENT" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old='export function decisionFor(control: "save-choices", toggles: ConsentToggles): ConsentDecision;'
new='export function decisionFor(control: "save-choices", toggles?: ConsentToggles): ConsentDecision;'
assert s.count(old)==1, "anchor"
open(p,"w").write(s.replace(old,new,1))
PY
( cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'TS[0-9]+' | head -3 )
( cd apps/ui && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1; echo "APPSUI_TSC_EXIT=$?" )
cp "$P/consent.orig" "$CONSENT"
echo "--- D2 BOTH overloads deleted (the author's own M15 mutant) ---"
python3 - "$CONSENT" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
o1='export function decisionFor(\n  control: "accept-all" | "essential-only",\n  toggles?: ConsentToggles\n): ConsentDecision;\n'
o2='export function decisionFor(control: "save-choices", toggles: ConsentToggles): ConsentDecision;\n'
assert s.count(o1)==1 and s.count(o2)==1, (s.count(o1), s.count(o2))
open(p,"w").write(s.replace(o1,"",1).replace(o2,"",1))
PY
( cd apps/ui && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'TS[0-9]+' | head -3 )
( cd apps/ui && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1; echo "APPSUI_TSC_EXIT=$?" )
echo "--- D3 does the ROOT typecheck see it? (COMMON §10.30's whole premise) ---"
tc=$(pnpm typecheck 2>&1); echo "root diagnostics outside the pin: $(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')"
cp "$P/consent.orig" "$CONSENT"

echo
echo "=== E. restore proof ==="
git status --porcelain | grep -v '.review-scratch' | wc -l
git diff --stat | wc -l
