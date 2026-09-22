#!/usr/bin/env python3
"""CODE-REV-CROSS-03 r1 — mutant battery against `modalSemantics.ts` at 4ef2f7d3.

Lane from argv (COMMON 10.35: no hard-coded worktrees path).
  python3 mutants.py <absolute lane path> [<mutant id> ...]

Discipline this harness enforces, each from a TOOLING-TRAPS entry paid for already:
  * snapshot with `cp`, restore with `cp`, verify with `diff` — never `git checkout`;
  * assert the anchor is UNIQUE before planting, and ABORT if it is not;
  * assert the mutant LANDED (post-plant text differs from the snapshot) in the same output;
  * classify BROKEN / RED / GREEN, never zero-vs-nonzero: a nonzero exit with an empty FAIL
    list AND an `Errors N error` line is CAUGHT; with no summary line at all it is BROKEN.
"""
import os
import shutil
import subprocess
import sys

LANE = sys.argv[1]
WANTED = set(sys.argv[2:])
SCRATCH = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(LANE, "apps/ui/components/consent/modalSemantics.ts")
SNAP = os.path.join(SCRATCH, "modalSemantics.ts.green")

SEM = "tests/render/consent-modal-semantics.test.tsx"
CROSS = "tests/render/consent-cross-slice.test.tsx"

PASS1 = "    if (container === null || container.isConnected) {"
PASS2_TEST = "    if (!topContainer.contains(container)) continue;"
PASS2_HEAD = "  for (index -= 1; topContainer !== null && index >= 0; index -= 1) {"
PASS2_SKIP = "    if (container === null || !container.isConnected) continue;"

MUTANTS = [
    ("M1-NO-TIEBREAK", "the (b') containment tiebreak removed (back to plain open order)",
     PASS2_HEAD, "  for (index -= 1; false && index >= 0; index -= 1) {", [SEM, CROSS]),
    ("M2-FOLLOWING", "a FOLLOWING arm added beside containment (the rule (b') replaced)",
     PASS2_TEST,
     "    if (!topContainer.contains(container) && "
     "(topContainer.compareDocumentPosition(container) & 4) === 0) continue;", [SEM, CROSS]),
    ("M3-NO-ISCONNECTED", "pass 1's detached-entry skip removed",
     PASS1, "    if (true) {", [SEM, CROSS]),
    ("M4-NONULL", "pass 1's null-container branch flipped to `container !== null && ...`",
     PASS1, "    if (container !== null && container.isConnected) {", [SEM, CROSS]),
    ("M5-STOP-AT-FIRST", "pass 2 stops at the FIRST descendant instead of descending the chain",
     "    top = entry;\n    topContainer = container;\n  }\n  return top;",
     "    top = entry;\n    topContainer = container;\n    break;\n  }\n  return top;", [SEM]),
    ("M6-PASS2-KEEPS-DETACHED", "pass 2 no longer skips a DISCONNECTED lower entry",
     PASS2_SKIP, "    if (container === null) continue;", [SEM, CROSS]),
    # The REMEDY, not a defect: the strict-descendant guard this seat proposes.
    ("R1-STRICT-DESCENDANT", "REMEDY: `container === topContainer ||` added to pass 2's test",
     PASS2_TEST,
     "    if (container === topContainer || !topContainer.contains(container)) continue;",
     [SEM, CROSS]),
]


def read(path):
    with open(path, encoding="utf8") as handle:
        return handle.read()


def classify(out, code):
    summary = [ln for ln in out.splitlines() if ln.strip().startswith("Tests ")]
    fails = [ln for ln in out.splitlines() if ln.strip().startswith("FAIL ")]
    errors = [ln for ln in out.splitlines() if ln.strip().startswith("Errors ")]
    if not summary:
        return "BROKEN", "", fails
    line = summary[-1].strip()
    if code != 0:
        return "CAUGHT", line, (fails or errors)
    return "SURVIVED", line, fails


def run(files):
    proc = subprocess.run(["pnpm", "exec", "vitest", "run", *files],
                          cwd=LANE, capture_output=True, text=True)
    return proc.stdout + proc.stderr, proc.returncode


shutil.copyfile(TARGET, SNAP)
green = read(SNAP)
print(f"# snapshot taken: {SNAP} ({len(green)} bytes)")

for mid, what, old, new, files in MUTANTS:
    if WANTED and mid not in WANTED:
        continue
    count = green.count(old)
    if count != 1:
        print(f"{mid} | FATAL: anchor occurs {count} times, expected 1 — aborting")
        shutil.copyfile(SNAP, TARGET)
        sys.exit(3)
    with open(TARGET, "w", encoding="utf8") as handle:
        handle.write(green.replace(old, new))
    landed = read(TARGET) != green
    print(f"{mid} | landed={landed} | {what}")
    if not landed:
        shutil.copyfile(SNAP, TARGET)
        sys.exit(3)
    out, code = run(files)
    verdict, summary, named = classify(out, code)
    print(f"{mid} | exit={code} | {verdict} | {summary}")
    for line in named[:8]:
        print(f"{mid} |    {line.strip()}")
    shutil.copyfile(SNAP, TARGET)
    assert read(TARGET) == green, f"{mid}: RESTORE FAILED"
    print(f"{mid} | restored, identical to snapshot")

print("# battery complete; target restored")
