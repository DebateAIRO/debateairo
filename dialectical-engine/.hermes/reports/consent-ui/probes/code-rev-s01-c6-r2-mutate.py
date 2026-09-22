#!/usr/bin/env python3
"""CODE-REV-S01-C6-r2 mutant planter. Lane from argv (COMMON 10.35)."""
import sys, os
lane, which = sys.argv[1], sys.argv[2]
p = os.path.join(lane, "apps/ui/components/consent/CookieConsent.tsx")
s = open(p).read()
OPEN_HEAD = "  const openCard = useCallback((opener: HTMLElement | null): void => {\n    setPolicyOpen(false);\n"
DISMISS = "  const dismiss = useCallback((): void => {\n    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);"
ONSAVE = """          onSave={(choice: ConsentChoice): void =>
            settle(decisionFor("save-choices", { quality: choice.quality, analytics: choice.analytics }))
          }"""
ONSAVE_RESET = """          onSave={(choice: ConsentChoice): void => {
            setPolicyOpen(false);
            settle(decisionFor("save-choices", { quality: choice.quality, analytics: choice.analytics }));
          }}"""
def need(t, name):
    assert s.count(t) == 1, f"target {name} occurs {s.count(t)} times"
if which == "MK":            # delete the restored line outright
    need(OPEN_HEAD, "openCard"); s = s.replace(OPEN_HEAD, OPEN_HEAD.replace("    setPolicyOpen(false);\n", ""))
elif which == "MN":          # move it to the LAST statement of openCard (author claims EQUIVALENT)
    need(OPEN_HEAD, "openCard"); s = s.replace(OPEN_HEAD, OPEN_HEAD.replace("    setPolicyOpen(false);\n", ""))
    t = '    setSurface("card");\n  }, []);'
    assert s.count(t) == 1; s = s.replace(t, '    setSurface("card");\n    setPolicyOpen(false);\n  }, []);')
elif which == "MD":          # reset in dismiss only (author's MD)
    need(OPEN_HEAD, "openCard"); s = s.replace(OPEN_HEAD, OPEN_HEAD.replace("    setPolicyOpen(false);\n", ""))
    need(DISMISS, "dismiss"); s = s.replace(DISMISS, DISMISS.replace('  const dismiss = useCallback((): void => {\n', '  const dismiss = useCallback((): void => {\n    setPolicyOpen(false);\n'))
elif which == "MRE":         # REVIEWER mutant: per-route fix covering exactly the two PINNED routes
    need(OPEN_HEAD, "openCard"); s = s.replace(OPEN_HEAD, OPEN_HEAD.replace("    setPolicyOpen(false);\n", ""))
    need(DISMISS, "dismiss"); s = s.replace(DISMISS, DISMISS.replace('  const dismiss = useCallback((): void => {\n', '  const dismiss = useCallback((): void => {\n    setPolicyOpen(false);\n'))
    need(ONSAVE, "onSave"); s = s.replace(ONSAVE, ONSAVE_RESET)
else:
    sys.exit("unknown mutant " + which)
open(p, "w").write(s)
print("planted", which)
