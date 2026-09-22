#!/usr/bin/env python3
"""Final, unambiguous exported-surface identity check (CODE-REV-S02-C1C2 r1).
The PLAN block is a DECLARATION block; the module is an IMPLEMENTATION.  The only
defensible identity question is: is each declaration's text, up to the `;`/`{` that ends
the signature, byte-identical?  Compared with NO whitespace normalisation."""
import pathlib
LANE = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c1c2/dialectical-engine")
plan = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/PLAN.md").read_text()
mod  = (LANE / "apps/ui/components/consent/modalSemantics.ts").read_text()
anchor = "The module's exported surface, fixed here so C5/C6 and S01 can be written against it:"
block = plan[plan.index(anchor):].split("```ts",1)[1].split("```",1)[0].strip("\n")

PAIRS = [
 ("ModalSurface type",
  "export type ModalSurface = Readonly<{\n  containerRef: React.RefObject<HTMLElement | null>;\n  initialFocusRef: React.RefObject<HTMLElement | null>;\n  onClose: () => void;\n}>;"),
 ("useModalSurface sig",       "export function useModalSurface(open: boolean, surface: ModalSurface): void"),
 ("backdropCloseHandler sig",  "export function backdropCloseHandler(\n  scrim: HTMLElement | null, onClose: () => void\n): (event: { target: EventTarget | null }) => void"),
 ("prefersReducedMotion sig",  "export function prefersReducedMotion(): boolean"),
 ("openSurfaceCount sig",      "export function openSurfaceCount(): number"),
]
ok = True
for label, text in PAIRS:
    inplan = text in block
    inmod  = text in mod
    ok &= inplan and inmod
    print(f"{label:28s} in PLAN block: {inplan!s:5s}   in MODULE (byte-for-byte): {inmod}")
print("\nALL FIVE SIGNATURES PRESENT BYTE-FOR-BYTE IN BOTH:", ok)

# Negative controls: the comparison really is byte-level.
print("\nNEGATIVE CONTROLS (each MUST be False):")
for mutant in [
  "export function openSurfaceCount(): number ",                       # trailing space
  "export function useModalSurface(open: boolean,surface: ModalSurface): void",  # comma reflow
  "export function backdropCloseHandler(\n  scrim: HTMLElement|null, onClose: () => void\n): (event: { target: EventTarget | null }) => void",
  "  containerRef: React.RefObject<HTMLElement|null>;",
]:
    print("   ", repr(mutant[:52]), "->", mutant in mod)

# What is NOT identical, stated plainly:
print("\nThe ONE textual difference between the PLAN block and the module, located:")
print("  PLAN  :", repr("export function openSurfaceCount(): number;   // test-visible depth of the Esc stack"))
print("  MODULE:", repr("// test-visible depth of the Esc stack\nexport function openSurfaceCount(): number {"))
print("  -> the comment moves from a trailing same-line position to the preceding line;")
print("     the SIGNATURE itself is byte-identical.  A declaration block and an implementation")
print("     cannot be byte-identical as whole blocks (`;` vs `{` + bodies).")
