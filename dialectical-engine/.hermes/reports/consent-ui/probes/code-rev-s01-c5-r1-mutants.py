#!/usr/bin/env python3
"""CODE-REV-S01-C5 r1 — reviewer's mutant runner.

Lane from argv (COMMON §10.35), never hard-coded. Pristine copies are taken with
shutil.copy2 and restored the same way — never `git checkout -- <path>`, which
STAGES the restore (TOOLING-TRAPS). `git status --porcelain` is printed after
every restore.

Each mutant: apply an exact string replacement, run the named suites, report the
summary line of each, restore, verify.
"""
import subprocess, sys, shutil, os, re, json

LANE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LANE", os.getcwd())
PRISTINE = os.path.join(LANE, ".review-scratch", "pristine")
os.makedirs(PRISTINE, exist_ok=True)

CC = "apps/ui/components/consent/CookieConsent.tsx"
CSS = "apps/ui/app/globals.css"
LAYOUT = "apps/ui/app/layout.tsx"
CONSENT = "apps/ui/lib/consent.ts"

TOUCHED = [CC, CSS, LAYOUT, CONSENT]


def snapshot():
    for f in TOUCHED:
        shutil.copy2(os.path.join(LANE, f), os.path.join(PRISTINE, f.replace("/", "__")))


def restore():
    for f in TOUCHED:
        shutil.copy2(os.path.join(PRISTINE, f.replace("/", "__")), os.path.join(LANE, f))


def porcelain():
    r = subprocess.run(["git", "status", "--porcelain"], cwd=LANE, capture_output=True, text=True)
    # .review-scratch/ is the reviewer's own scratch (deleted before handoff); it is
    # excluded here so a mutant restore is judged on the WORK TREE only.
    return [l for l in r.stdout.strip().split("\n") if l.strip() and ".review-scratch" not in l]


def apply(path, old, new, count=1):
    p = os.path.join(LANE, path)
    src = open(p).read()
    n = src.count(old)
    assert n >= 1, f"MUTANT ANCHOR NOT FOUND in {path}: {old[:70]!r}"
    open(p, "w").write(src.replace(old, new, count))
    return n


def run_vitest(args, config=None):
    cmd = ["pnpm", "exec", "vitest", "run"]
    if config:
        cmd += ["--config", config]
    cmd += args
    r = subprocess.run(cmd, cwd=LANE, capture_output=True, text=True)
    out = r.stdout + r.stderr
    sums = [l.strip() for l in out.split("\n") if re.match(r"^\s*Tests\s+", l)]
    fails = [l.strip() for l in out.split("\n") if re.match(r"^\s*FAIL\s", l)]
    firstmsg = ""
    m = re.search(r"(AssertionError|Error): (.+)", out)
    if m:
        firstmsg = m.group(0)[:180]
    return (sums[-1] if sums else "(no summary)"), len(fails), firstmsg


REV_CFG = ".review-scratch/rev.vitest.config.ts"
AUTHOR = ["tests/render/consent-mount.test.tsx"]


def report(tag, desc, suites):
    print(f"\n### {tag} — {desc}")
    for label, args, cfg in suites:
        s, nf, msg = run_vitest(args, cfg)
        verdict = "RED" if nf else "GREEN"
        print(f"  {label:<26} {verdict:<5} {s}")
        if msg and nf:
            print(f"      first error: {msg}")


snapshot()
print("pristine copies taken. porcelain now:", porcelain())

# ---------------------------------------------------------------- RM1
# The mutant the packet demands and the author could not build: the machine
# REMEMBERS the entry point and lets the Settings entry keep the bar hidden.
# This is the v1-SPEC rule REQ-REV-01 B1 deleted, implemented faithfully.
apply(CC, "import { useCallback, useEffect, useRef, useState } from \"react\";",
          "import { useCallback, useEffect, useRef, useState } from \"react\";")
apply(CC, "  const openerRef = useRef<HTMLElement | null>(null);",
          "  const openerRef = useRef<HTMLElement | null>(null);\n  const sourceRef = useRef<\"bar\" | \"settings\">(\"bar\");")
apply(CC, "  useEffect(() => subscribeToPreferenceRequests(openCard), [openCard]);",
          "  useEffect(() => subscribeToPreferenceRequests((o) => { sourceRef.current = \"settings\"; openCard(o); }), [openCard]);")
apply(CC, "    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);\n\n  if (surface === undefined",
          "    if (sourceRef.current === \"settings\") { setSurface(\"silent\"); return; }\n    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);\n\n  if (surface === undefined")
apply(CC, "      onChoose={openCard}",
          "      onChoose={(o) => { sourceRef.current = \"bar\"; openCard(o); }}")
report("RM1", "entry-point discriminator: the SETTINGS entry keeps the bar hidden (the B1 defect)",
       [("reviewer probe", [], REV_CFG), ("author consent-mount", AUTHOR, None)])
restore(); assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM2
# PRESENCE instead of VALIDITY at the dismissal. R14 says "iff no VALID v:1
# decision is stored"; V-19 makes present-but-invalid a reachable state.
apply(CC, "  const dismiss = useCallback((): void => {\n    setSurface(readConsent() === null ? \"bar\" : \"silent\");",
          "  const dismiss = useCallback((): void => {\n    setSurface(localStorage.getItem(\"debateai.consent\") === null ? \"bar\" : \"silent\");")
report("RM2", "dismissal keys on the KEY'S PRESENCE, not on the decision's validity",
       [("reviewer probe", [], REV_CFG), ("author consent-mount", AUTHOR, None)])
restore(); assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM3
# The same substitution at the MOUNT effect.
apply(CC, "    setSurface(readConsent() === null ? \"bar\" : \"silent\");\n  }, []);\n\n  /**\n   * Opening the card",
          "    setSurface(localStorage.getItem(\"debateai.consent\") === null ? \"bar\" : \"silent\");\n  }, []);\n\n  /**\n   * Opening the card")
report("RM3", "the MOUNT keys on the key's presence, not on the decision's validity",
       [("reviewer probe", [], REV_CFG), ("author consent-mount", AUTHOR, None)])
restore(); assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM4 (author's M6)
apply(CC, "    setInitial(togglesFor(readConsent()));\n", "")
report("RM4", "the N6 stale-initial defect: `initial` no longer recomputed per open (author's M6)",
       [("reviewer probe", [], REV_CFG), ("author consent-mount", AUTHOR, None)])
restore(); assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM5 (author's M7)
PANEL = "apps/ui/components/consent/ConsentSettingsPanel.tsx"
shutil.copy2(os.path.join(LANE, PANEL), os.path.join(PRISTINE, PANEL.replace("/", "__")))
apply(PANEL, "onClick={(event) => requestPreferences(event.currentTarget)}", "onClick={() => {}}")
report("RM5", "the Settings button stops calling requestPreferences (author's M7)",
       [("reviewer probe", [], REV_CFG), ("author consent-mount", AUTHOR, None)])
shutil.copy2(os.path.join(PRISTINE, PANEL.replace("/", "__")), os.path.join(LANE, PANEL))
assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM6
# N3 / author's D2: is ":root only" FORCED by t9's set equality, or merely chosen?
apply(CSS, "html[data-mode=\"chamber\"] {", "html[data-mode=\"chamber\"] {\n  --shadow-knob: 0 1px 3px rgba(0,0,0,.3);")
report("RM6", "--shadow-knob ALSO declared in the Chamber block (the packet headline's 'BOTH blocks')",
       [("t9 token contract", ["tests/unit/t9-mode-tokens.test.ts"], None)])
restore(); assert not porcelain(), porcelain()

# ---------------------------------------------------------------- RM7
apply(LAYOUT, "          <TopBar />\n          {children}\n          <CookieConsent />",
              "          <CookieConsent />\n          <TopBar />\n          {children}")
report("RM7", "the mount moved between .appShell and <TopBar />",
       [("author consent-mount", AUTHOR, None), ("t3-library (CMD-C5 arm)", ["tests/render/t3-library.test.tsx"], None)])
restore(); assert not porcelain(), porcelain()

print("\nFINAL porcelain:", porcelain() or "EMPTY")
