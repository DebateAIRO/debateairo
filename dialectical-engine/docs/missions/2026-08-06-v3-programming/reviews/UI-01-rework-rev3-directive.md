# UI-01 rework directive — rev2 → rev3

**Diamond:** Grok APPROVED · Opus 5 CHANGES REQUESTED (2 blocking). B1 and B2
are CLOSED — verified by live DOM and by running your mutations against the
real suite (all RED, baseline green, md5-verified restores). What remains is
the DR-160 half.

## Closed — do not touch

B1: the adaptive-depth panel mounts in the V3-reachable section, exactly one
Approve button, disabled + aria-disabled, truthful tooltip verbatim from the
API's rejection reason, visible sibling copy (A6 folded). B2: MUT-A/B/C plus
two new mutations all go RED against the enforced suite; the
`not.toContain("onClick=")` closes the un-awaited-call escape. Also verified
unregressed: byte-identical viewport, V2-base+85-line canvas, badges and maker
tags live, control bytes 0, frozen formatter untouched. **And the title
dimension of DR-160 genuinely works** — long question collapses at 1280px,
title 159px → 520px.

## B4 — BLOCKING: a rev2 REGRESSION at phone width

At ≤640px with a NORMAL-length question, four of five top-bar actions render
OUTSIDE the viewport (hit-test OUTSIDE-VIEWPORT, overflow `display:none`,
`collapsed:"false"`). rev1 and V2 do not have this bug. Two causes, both
yours to fix:

1. `apps/v2-ui/app/globals.css:2840-2944` ports V2's phone block INCLUDING
   `grid-template-columns: minmax(0,1fr) 44px 44px` but DROPS the two rules
   that block assumed: V2's `.debateInlineActions{display:none}` and
   `.debateOverflow{display:block}` (`debate-chrome.css:434-436`, `:459-463`).
   The grid squeezes a row whose actions were supposed to be hidden.
2. `DebatePageClient.tsx:760-763` measures need with
   `getBoundingClientRect().width` — the SHRUNK width. It computed needed 420
   vs available 420 while the row's true content is 612px. **Action overflow
   is undetectable by construction**: measure intrinsic need (scrollWidth /
   content width), not the post-squeeze rect.

The phone case currently passes ONLY when the question happens to be long.

## B5 — BLOCKING: the DR-160 ratchet is hollow

`tests/unit/v2ui-pages.test.ts:302-306` claims to kill "a crowded bar stops
collapsing" but only unit-calls the 3-line predicate. FOUR mutations survive
the full suite: `neededWidth ≡ 0`; title-width × 0; observers removed; always
collapse. The lens APPLIED the first one live and got rev1's exact defect back
— title 282px of 880 needed at 1280px — with the suite green.

Fix: assert through the MEASUREMENT path, not just the predicate. The
enforced test must fail for each of those four mutations (state which
assertion kills which). If jsdom cannot carry real measurement, test the
measurement adapter seam behaviourally and ratchet the wiring — but the
predicate-only test may not be presented as the DR-160 guard.

## Fold in (cheap, same files)

- A8: the Approve button overlaps its reason copy at ≤640px.
- A9: correct the handoff's AC rows — "Overflow protects the title = GREEN"
  and the MUT-D framing are wrong as written.
- A11: the whitespace-fragile region anchor in the new test.

## Recorded elsewhere (not yours)

A7 (the 520px title cap is V2's own; V's call whether to lift) — orchestrator
will raise with V at the visual gate. A10 (API crashes on a non-UUID answer
id) — routed to POL-02.

## Done when

B4 dead at real phone widths with a normal question (and still no clipping
with a long one); B5's four mutations each killed by a named enforced
assertion; A8/A9/A11 folded; gates green with REAL pasted output; handoff AC
table corrected; same session; `REWORK READY FOR HERMES REVIEW — UI-01 rework
rev3`.
