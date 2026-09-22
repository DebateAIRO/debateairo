#!/usr/bin/env python3
"""CODE-REV-S02-C1C2 r2 — mutation harness against the CLUSTER'S OWN suite.

Every round-1 mutant (M1..M10 of the r1 verdict §5.7) plus the B1/N1 mutants this round
introduces.  Each: apply to a pristine byte copy -> run the cluster command -> print the
failing test NAMES with an ASCII anchor (COMMON §10.16: never vitest's status glyph) ->
restore -> print `git status --porcelain` for the module.
"""
import hashlib
import pathlib
import subprocess
import sys

# Lane-independent (fixes the r1 kit's hard-coded path — CODE-S02-C1C2-REWORK-R1 F6):
# pass the lane as argv[1], else fall back to this file's own repo root.
LANE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1]
MOD = LANE / "apps/ui/components/consent/modalSemantics.ts"
CMD = ["pnpm", "exec", "vitest", "run", "tests/render/consent-modal-semantics.test.tsx"]

PRISTINE = MOD.read_text()
PRISTINE_SHA = hashlib.sha256(PRISTINE.encode()).hexdigest()[:24]

TOPMOST_CALL = "  const top = topmostSurface();"
ABOVE_BLOCK = (
    "      (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||\n"
    "      (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;"
)
ADVANCE_LOOP = (
    "  for (let attempt = 0; attempt < focusable.length; attempt += 1) {\n"
    "    cursor = (cursor + step + focusable.length) % focusable.length;\n"
    "    const next = focusable[cursor]!;\n"
    "    focusElement(next);\n"
    "    if (document.activeElement === next) return;\n"
    "  }"
)
NO_ADVANCE = (
    "  cursor = (cursor + step + focusable.length) % focusable.length;\n"
    "  focusElement(focusable[cursor]!);"
)
TABINDEX_FILTER = '  if (element.getAttribute("tabindex") === "-1") return false;\n'
HIDDEN_FILTER = (
    '  return !(element.nodeName === "INPUT" && (element as HTMLInputElement).type === "hidden");'
)

# --- the "cached at open" mutant needs three coordinated edits (r1's M3b) ---
def cache_at_open(src: str) -> str:
    src = src.replace(
        "let listenerAttached = false;",
        "let listenerAttached = false;\nlet cachedFocusable: HTMLElement[] | null = null;",
        1,
    )
    src = src.replace(
        "  const focusable = focusableWithin(entry.read().containerRef.current);",
        "  const focusable = cachedFocusable ?? focusableWithin(entry.read().containerRef.current);",
        1,
    )
    src = src.replace(
        "    surfaceStack.push(entry);",
        "    surfaceStack.push(entry);\n    cachedFocusable = focusableWithin(surfaceRef.current.containerRef.current);",
        1,
    )
    src = src.replace(
        "      if (surfaceStack.length === 0) detachListener();",
        "      cachedFocusable = null;\n      if (surfaceStack.length === 0) detachListener();",
        1,
    )
    return src


def rep(old: str, new: str):
    def apply(src: str) -> str:
        if old not in src:
            raise SystemExit(f"ANCHOR MISSING: {old[:60]!r}")
        return src.replace(old, new, 1)
    return apply


def chain(*fns):
    def apply(src: str) -> str:
        for fn in fns:
            src = fn(src)
        return src
    return apply


MUTANTS = [
    # ---- the ten round-1 mutants, re-planted ----
    ("M1  FIFO (surfaceStack[0])", rep(TOPMOST_CALL, "  const top = surfaceStack[0];")),
    ("M2  stack never pops", rep("      if (index !== -1) surfaceStack.splice(index, 1);", "      void index;")),
    ("M3b focusable set cached AT OPEN", cache_at_open),
    ("M4  focus not returned", rep("      focusElement(opener);", "      void opener;")),
    ("M5  matchMedia unguarded", rep('  if (typeof window.matchMedia !== "function") return false;\n', "")),
    ("M6  Escape to EVERY surface", rep("    top.read().onClose();\n    return;",
                                        "    for (const each of [...surfaceStack]) each.read().onClose();\n    return;")),
    ("M7  Tab preventDefault removed", rep("  event.preventDefault();\n  // Advance past", "  // Advance past")),
    ("M8  initial focus not applied", rep("    focusElement(surfaceRef.current.initialFocusRef.current);",
                                          "    void surfaceRef.current;")),
    ("M9  second document keydown listener", rep('  document.addEventListener("keydown", handleDocumentKeydown);',
                                                 '  document.addEventListener("keydown", handleDocumentKeydown);\n'
                                                 '  document.addEventListener("keydown", handleDocumentKeydown, true);')),
    ("M10 stopPropagation removed", rep("    event.stopPropagation();\n", "")),
    # ---- B1's own class ----
    ("MB1a round-1 impl restored (last registered)",
     rep(TOPMOST_CALL, "  const top = surfaceStack[surfaceStack.length - 1];")),
    ("MB1b containment arm ONLY (drop FOLLOWING)",
     rep(ABOVE_BLOCK, "      (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0;")),
    ("MB1c FOLLOWING arm ONLY (drop CONTAINED_BY)",
     rep(ABOVE_BLOCK, "      (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;")),
    ("MB1d topmost = first in document order (invert)",
     rep(ABOVE_BLOCK, "      (relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0;")),
    # ---- N1's own class ----
    ("MN1a no tabindex=-1 filter", rep(TABINDEX_FILTER, "")),
    ("MN1b no hidden-input filter", rep(HIDDEN_FILTER, "  return true;")),
    ("MN1c no advance loop", rep(ADVANCE_LOOP, NO_ADVANCE)),
    ("MN1d neither hidden filter nor advance",
     chain(rep(HIDDEN_FILTER, "  return true;"), rep(ADVANCE_LOOP, NO_ADVANCE))),
    ("MN1e whole isFocusCandidate filter removed",
     rep("  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusCandidate);",
         "  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];")),
]

print(f"pristine sha256[:24] = {PRISTINE_SHA}   ({len(PRISTINE)} bytes)")
print(f"cluster command: {' '.join(CMD)}\n")
caught = 0
for label, apply in MUTANTS:
    MOD.write_text(apply(PRISTINE))
    proc = subprocess.run(CMD, cwd=LANE, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    summary = [ln for ln in out.splitlines() if ln.strip().startswith("Tests ")]
    fails = [ln.strip() for ln in out.splitlines() if ln.strip().startswith("FAIL ")]
    subprocess.run(["git", "checkout", "HEAD", "--", "apps/ui/components/consent/modalSemantics.ts"],
                   cwd=LANE, check=True)
    restored = MOD.read_text()
    porcelain = subprocess.run(["git", "status", "--porcelain", "--", "apps/ui/components/consent/modalSemantics.ts"],
                               cwd=LANE, capture_output=True, text=True).stdout.strip()
    killed = proc.returncode != 0
    caught += 1 if killed else 0
    print(f"{'KILLED ' if killed else 'SURVIVED'} | {label}")
    print(f"    exit={proc.returncode}   {summary[-1].strip() if summary else '(no summary line)'}")
    for f in fails[:6]:
        print(f"    {f}")
    assert restored == PRISTINE, f"RESTORE FAILED for {label}"
    print(f"    restored: byte-identical to pristine = True · porcelain for module = [{porcelain}]")
print(f"\nKILLED {caught} / {len(MUTANTS)}")
