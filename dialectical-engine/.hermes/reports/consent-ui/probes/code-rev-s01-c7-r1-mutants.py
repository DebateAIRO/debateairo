#!/usr/bin/env python3
"""CODE-REV-S01-C7 r1 probe kit — mutation harness for the S01-C7 guards.

Lane comes from argv[1] (COMMON 10.35): no lane path is hard-coded (grep-clean for the worktrees prefix).
Usage:  mutants.py <lane> <mutant-id> [<mutant-id> ...]   |   mutants.py <lane> ALL

Each mutant: cp-snapshot every file it touches -> apply (anchor asserted UNIQUE)
-> run the guard suite -> restore from the snapshot with cp -> `diff -q` ->
`git status --porcelain`.  Never `git checkout` (COMMON 10.44).
"""
import hashlib
import os
import shutil
import subprocess
import sys

BAR = "apps/ui/components/consent/CookieBar.tsx"
CONSENT = "apps/ui/components/consent/CookieConsent.tsx"
CARD = "apps/ui/components/consent/CookiePreferencesCard.tsx"
HELPER = "apps/ui/components/consent/modalSemantics.ts"
LIB = "apps/ui/lib/consent.ts"
CSS = "apps/ui/app/globals.css"
SIXTH = "apps/ui/components/consent/ZzProbeSixth.tsx"

GUARDS = ["pnpm", "exec", "vitest", "run", "tests/render/consent-guards.test.tsx"]
POLICY = ["pnpm", "exec", "vitest", "run", "tests/render/consent-policy-link.test.tsx"]

# id -> (files, edits, command, note)
# an edit is ("sub", path, old, new) | ("create", path, body) | ("delete", path)
MUTANTS = {
    # ---- S01-S42, the colour-literal guard ----
    "M42": ([BAR], [("sub", BAR, '<div className="consentBarBezel">',
                     '<div className="consentBarBezel" style={{ borderColor: "#A8823E" }}>')],
            GUARDS, "PLAN:546 N7 mutant — hex literal on the bar bezel"),
    "N1": ([BAR], [("sub", BAR, '<div className="consentBarBezel">',
                    '<div className="consentBarBezel" style={{ borderColor: "var(--gold)" }}>')],
           GUARDS, "neighbour — the same attribute through a token"),
    "MX3": ([BAR], [("sub", BAR, '<div className="consentBarBezel">',
                     '<div className="consentBarBezel" style={{ borderColor: "oklch(0.7 0.1 90)" }}>')],
            GUARDS, "reviewer mutant — the oklch( arm of the same regex"),
    "MX1": ([LIB], [("sub", LIB, 'export const CONSENT_KEY',
                     'const REVIEWER_PROBE_BRAND = "rgba(41,38,31,.10)";\n\nexport const CONSENT_KEY')],
            GUARDS, "reviewer mutant — rgba( literal in lib/consent.ts, a file the author never mutated"),
    "MX2": ([SIXTH], [("create", SIXTH,
                       'export const REVIEWER_PROBE_SIXTH = "#A8823E";\n')],
            GUARDS, "reviewer mutant — a SIXTH file under consent/ carrying a literal (the run-time directory scan)"),
    "MX4": ([HELPER], [("sub", HELPER, '"use client";', '"use client";\n\nconst REVIEWER_PROBE_S02 = "#A8823E";')],
            GUARDS, "reviewer mutant — a literal in S02's modalSemantics.ts, which S01-S42 excludes BY NAME (must NOT be caught)"),

    "MX11": (["apps/ui/lib/consentProbeSixth.ts"],
             [("create", "apps/ui/lib/consentProbeSixth.ts", 'export const REVIEWER_PROBE_LIB = "#A8823E";\n')],
             GUARDS, "reviewer mutant — a NEW S01 file under apps/ui/lib/ carrying a literal (S01-S42's directory clause covers components/consent/ only)"),

    # ---- S01-S43, the reduced-motion coverage guard ----
    "M43a": ([CSS], [("sub", CSS, ".consentBar {\n  position: fixed;",
                      ".consentBar {\n  transition: opacity .18s ease;\n  position: fixed;")],
             GUARDS, "PLAN:554 N7 mutant — motion on .consentBar with NO counterpart"),
    "M43b": ([CSS], [("sub", CSS, ".consentBar {\n  position: fixed;",
                      ".consentBar {\n  transition: opacity .18s ease;\n  position: fixed;"),
                     ("sub", CSS, "  .consentBar .consentPrimary { transition: none; }",
                      "  .consentBar { transition: none; }\n\n  .consentBar .consentPrimary { transition: none; }")],
             GUARDS, "PLAN:554 coverage direction — the SAME motion, now NAMED in the reduced-motion rule (must pass)"),
    "N2": ([CSS], [("sub", CSS, ".consentBar {\n  position: fixed;",
                    "/* transition: opacity .18s ease; */\n.consentBar {\n  position: fixed;")],
           GUARDS, "neighbour — the word transition: inside a CSS COMMENT"),
    "N3": ([CSS], [("sub", CSS, ".consentBarBezel {", ".consentBarBezel {\n  transform: scale(1.01);")],
           GUARDS, "neighbour — a transform (not a motion property) on an unnamed consent selector"),

    "MX10": ([CSS], [("sub", CSS, "@media (max-width: 719.98px) {\n  .consentBar {\n    left: 12px;",
                      "@media (max-width: 719.98px) {\n  .consentBar {\n    transition: opacity .2s ease;\n    left: 12px;")],
             GUARDS, "reviewer mutant — motion on .consentBar NESTED inside the block's max-width at-rule (tests the recursive descent)"),

    # ---- S01-S44, the honesty guards ----
    "M44a": ([CONSENT], [("sub", CONSENT, "  const [policyOpen, setPolicyOpen] = useState(false);",
                          "  const plausibleReady = true;\n  const [policyOpen, setPolicyOpen] = useState(false);")],
             GUARDS, "PLAN:562(b) N7 mutant — an SDK name as a bare identifier"),
    "N4": ([CONSENT], [("sub", CONSENT, "  const [policyOpen, setPolicyOpen] = useState(false);",
                        "  const telemetryReady = true;\n  const [policyOpen, setPolicyOpen] = useState(false);")],
           GUARDS, "neighbour — telemetry-SHAPED but outside the eleven named SDKs"),
    "M44b": ([CONSENT], [("sub", CONSENT,
                          "  useEffect(() => {\n    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);",
                          "  useEffect(() => {\n    if (readConsent()?.analytics) { document.body.dataset.consentAnalytics = \"on\"; }\n    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);")],
             GUARDS, "PLAN:562(a) N7 mutant — a code path gated on the stored boolean"),
    "N5": ([CONSENT], [("sub", CONSENT, "  const [policyOpen, setPolicyOpen] = useState(false);",
                        "  const snapshot = { analytics: readConsent()?.analytics };\n  const [policyOpen, setPolicyOpen] = useState(false);")],
           GUARDS, "neighbour — the same boolean read in a DATA position under a NEW receiver"),
    "MX6": ([CONSENT], [("sub", CONSENT, "  const [policyOpen, setPolicyOpen] = useState(false);",
                         "  const cfg = { analytics: readConsent()?.analytics ? loadIt() : skipIt() };\n  const [policyOpen, setPolicyOpen] = useState(false);")],
            GUARDS, "reviewer mutant — a REAL gate (ternary test) on a line that also carries a well-formed `analytics:` key (the author's own disclosed line-shape hole)"),

    # ---- S01-S45, the one-implementation guards ----
    "M45a": ([CARD], [("sub", CARD, "export function CookiePreferencesCard(",
                       'useEffect(() => { document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, []);\n\nexport function CookiePreferencesCard(')],
             GUARDS, "PLAN:570 N7 mutant — a second keydown listener in the card"),
    "N6": ([CARD], [("sub", CARD, "export function CookiePreferencesCard(",
                     'const onResizeProbe = () => {};\nwindow.addEventListener("resize", onResizeProbe);\n\nexport function CookiePreferencesCard(')],
           GUARDS, "neighbour — a resize listener (the PLAN's stated exemption, live in PrivacyPolicyModal.tsx:118,122)"),
    "MX7": ([CARD], [("sub", CARD, "export function CookiePreferencesCard(",
                      'const KEYDOWN_PROBE = "key" + "down";\ndocument.addEventListener(KEYDOWN_PROBE, () => {});\n\nexport function CookiePreferencesCard(')],
            GUARDS, "reviewer mutant — a second keydown listener whose event name is COMPUTED (evades a literal-token guard)"),
    "MX8": ([CARD], [("sub", CARD, "export function CookiePreferencesCard(",
                      'const focusProbe = (el: HTMLElement): void => { el.focus({ preventScroll: true }); };\n\nexport function CookiePreferencesCard(')],
            GUARDS, "reviewer mutant — a focus move written as .focus({ preventScroll: true }) (evades the `.focus()` literal)"),
    "MX9": (["apps/ui/components/consent/PrivacyPolicyModal.tsx"],
            [("sub", "apps/ui/components/consent/PrivacyPolicyModal.tsx", '"use client";',
              '"use client";\n\nconst probeNoop = (): void => {};\ndocument.addEventListener("keydown", probeNoop);')],
            GUARDS, "reviewer mutant — a keydown listener in S02's PrivacyPolicyModal.tsx, which S01-S45 DOES scan (author U2) — must be CAUGHT"),
    "M45b": ([HELPER], [("sub", HELPER, 'addEventListener("keydown"', 'addEventListener("keyup"')],
             GUARDS, "SECOND ARM — the shared helper LOSES its own keydown implementation (arm 2 must fail the other way)"),

    # ---- the C6 follow-up ----
    "MR-E": ([CONSENT], [
        ("sub", CONSENT, "  const openCard = useCallback((opener: HTMLElement | null): void => {\n    setPolicyOpen(false);\n",
         "  const openCard = useCallback((opener: HTMLElement | null): void => {\n"),
        ("sub", CONSENT, "  const dismiss = useCallback((): void => {\n",
         "  const dismiss = useCallback((): void => {\n    setPolicyOpen(false);\n"),
        ("sub", CONSENT,
         "          onSave={(choice: ConsentChoice): void =>\n            settle(decisionFor(\"save-choices\", { quality: choice.quality, analytics: choice.analytics }))\n          }",
         "          onSave={(choice: ConsentChoice): void => {\n            setPolicyOpen(false);\n            settle(decisionFor(\"save-choices\", { quality: choice.quality, analytics: choice.analytics }));\n          }}")],
             POLICY, "the reviewer's COUNTERFEIT MR-E — reset deleted from openCard, written into dismiss + the onSave lambda ONLY"),
    "MN": ([CONSENT], [
        ("sub", CONSENT, "  const openCard = useCallback((opener: HTMLElement | null): void => {\n    setPolicyOpen(false);\n    openerRef.current = opener;\n    setInitial(togglesFor(readConsent()));\n    setOpens((count) => count + 1);\n    setSurface(\"card\");",
         "  const openCard = useCallback((opener: HTMLElement | null): void => {\n    openerRef.current = opener;\n    setInitial(togglesFor(readConsent()));\n    setOpens((count) => count + 1);\n    setSurface(\"card\");\n    setPolicyOpen(false);")],
           POLICY, "EQUIVALENT mutant MN — the reset moved to the LAST statement of openCard (must NOT be caught)"),
    "MK": ([CONSENT], [
        ("sub", CONSENT, "  const openCard = useCallback((opener: HTMLElement | null): void => {\n    setPolicyOpen(false);\n",
         "  const openCard = useCallback((opener: HTMLElement | null): void => {\n")],
           POLICY, "the reset deleted outright"),
    "M4TH": ([CARD], [("sub", CARD, '<span className="consentFooterGap" />',
                       '<span className="consentFooterGap" />\n            <button type="button" className="consentGhost">Not now</button>')],
             POLICY, "a FOURTH footer control appears"),
}


def sh(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def md5(path):
    return hashlib.md5(open(path, "rb").read()).hexdigest()


def run_one(lane, mid, snapdir):
    files, edits, cmd, note = MUTANTS[mid]
    print(f"\n================ {mid} — {note} ================")
    snaps = {}
    for rel in files:
        src = os.path.join(lane, rel)
        dst = os.path.join(snapdir, mid + "__" + rel.replace("/", "__"))
        if os.path.exists(src):
            shutil.copy2(src, dst)
            snaps[rel] = dst
        else:
            snaps[rel] = None  # created by this mutant

    try:
        for edit in edits:
            if edit[0] == "sub":
                _, rel, old, new = edit[:4]
                expected = edit[4] if len(edit) > 4 else 1
                path = os.path.join(lane, rel)
                text = open(path, encoding="utf8").read()
                n = text.count(old)
                assert n == expected, f"ABORT {mid}: anchor occurs {n}x in {rel}, expected {expected}"
                open(path, "w", encoding="utf8").write(text.replace(old, new, 1))
                assert md5(path) != md5(snaps[rel]), f"ABORT {mid}: {rel} unchanged after the edit"
            elif edit[0] == "create":
                _, rel, body = edit
                open(os.path.join(lane, rel), "w", encoding="utf8").write(body)
            else:
                raise SystemExit("unknown edit")
        code, out = sh(cmd, lane)
        summary = [l for l in out.splitlines() if l.strip().startswith(("Tests ", "Test Files "))]
        frames = [l for l in out.splitlines()
                  if l.strip().startswith(("× ", "FAIL ", "AssertionError", "→ ", "- Expected", "+ Received", "+ ", "- "))
                  or " -> apps/ui" in l or l.strip().startswith("❯ tests/")]
        print(f"exit={code}")
        print("\n".join(summary))
        print("\n".join(frames[:18]))
    finally:
        for rel, snap in snaps.items():
            path = os.path.join(lane, rel)
            if snap is None:
                if os.path.exists(path):
                    os.remove(path)
            else:
                shutil.copy2(snap, path)
                d = subprocess.run(["diff", "-q", snap, path], capture_output=True, text=True)
                print(f"restore {rel}: {'IDENTICAL' if d.returncode == 0 else 'DIFFERS ' + d.stdout}")
        code, out = sh(["git", "status", "--porcelain"], lane)
        print(f"git status --porcelain = {len([l for l in out.splitlines() if l.strip()])} entries")


if __name__ == "__main__":
    lane = sys.argv[1]
    ids = sys.argv[2:]
    if ids == ["ALL"]:
        ids = list(MUTANTS)
    snapdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snaps")
    os.makedirs(snapdir, exist_ok=True)
    for mid in ids:
        run_one(lane, mid, snapdir)
