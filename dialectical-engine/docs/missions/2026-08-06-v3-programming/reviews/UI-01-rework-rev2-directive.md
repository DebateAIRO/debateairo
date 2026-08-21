# UI-01 rework directive — rev1 → rev2

**Diamond:** Grok APPROVED · Opus 5 CHANGES REQUESTED (3 blocking, 6 advisory).
Opus verified the LIVE RENDERED DOM and mutation-tested the ratchets.

## What is right (do not touch)

The merge shape is EXACTLY right: `CanvasViewport.tsx` + `lib/canvasViewport.ts`
byte-identical to `apps/dialectical-engine/web`'s; `DebateCanvas.tsx` = newer
V2's 530 lines + 73 lines of V3 additions and NOTHING else. Badges render live
(98%/88% with full provenance), maker tags render live (GPT/Claude dots),
viewport functional (zoom/fit/1:1 all verified), adapter clean of control
bytes, frozen formatter untouched.

## B1 — BLOCKING: adaptive-depth approval is HIDDEN, not disabled

`DebatePageClient.tsx:938` gates `scoringInsightsExpandable` on V2 scoring
being loaded with >0 nodes — unreachable in V3 (`api.ts:167-169` always
resolves `scoringUnavailable`). `AdaptiveDepthDryRunPanel` — the ONLY mount of
the disabled "Approve selected expansions" button — sits inside that dead
branch. Live check: ZERO /Approve/ buttons in the document. DR-146(3) ordered
VISIBLE-but-disabled; the rework made it unreachable-but-disabled, and the
handoff's AC table claims GREEN. Fix: mount the panel (or a V3-honest
equivalent surface) reachable in V3, greyed, tooltip naming the real missing
capability.

## B2 — BLOCKING: the enforced ratchets cannot fail; PROVEN by three mutations

The `disabled` assertions live only in `*.source-test.mjs` files that NO GATE
RUNS (root vitest includes `tests/**/*.test.ts`; the v2-ui `test` script
points at a nonexistent `scripts/run-node-tests.mjs` — the dead runner again).
In the ENFORCED suite, `disabled` appears only in three test TITLES. The lens
re-ran the enforced assertions against three in-memory mutations — ALL PASS:
- MUT-A: delete the `<V3ScoreBadges>` JSX (declared, computed, never rendered)
  → green, because the ratchet asserts `toContain("function V3ScoreBadges")`,
  a DECLARATION.
- MUT-B: re-enable Regenerate with a real un-awaited call, keeping the tooltip
  → the test "keeps node regeneration visible but disabled" stays green.
- MUT-C: delete the maker meta line from the node header → green.
Fix: move the load-bearing assertions into the ENFORCED suite and make each
fail its own mutation (assert the RENDER SITE, not the declaration; assert
disabled AT the button; assert the meta line in the header branch that
renders it). Do not resurrect the dead runner here — that is HYG-01 — put the
assertions where the gates already run.

## B3 — NOT YOURS: routed to V

The 640px threshold's provenance is HONEST (cited to `debate-chrome.css:410`,
`:434-436`, `:459-463` — the newer V2's own behaviour; AC-76 satisfied). But
live at 1280px the title still gets 159px of the 526px it needs and the
overflow never engages; readable only at ≤920px. The code is defensible; the
handoff's "GREEN, no new design question" claim is not. The threshold above
920px is a DESIGN NUMBER — V is being asked directly. Do not pick one. If V's
answer arrives before your rev2 lands, fold it in; otherwise rev2 covers
B1+B2 only and says so.

## Advisories to fold in (cheap, same files)

A3: `DebateTree.tsx:174-192` now shows Regenerate on abandoned/token-less
nodes (V2 never did) + mangled indentation + two never-called callbacks.
A4: dead `onRegenNode` prop threaded through `DebateCanvas`. A5: name the
`data-node-id` addition in the handoff's adaptation list. A6: give the
unavailable adaptive branch a visible reason, not tooltip-only.
A1 (dead runner) and A2 (stale `lib/api.test.mjs`) belong to HYG-01 — record,
do not fix here.

## Done when

B1 + B2 closed with mutation-proof assertions in the ENFORCED suite (state
which mutation each new assertion kills); advisories folded or recorded; every
gate green with REAL pasted output; handoff updated in place with the AC table
CORRECTED (B1/B3 rows must not claim green); same session; back to `review`
with `REWORK READY FOR HERMES REVIEW — UI-01 rework rev2`.

---

## ADDENDUM — V RULED B3 (DR-160) before rev2 dispatched: fold it in

V chose **content-aware collapse**: the overflow menu engages WHENEVER THE
TITLE LACKS THE ROOM IT NEEDS, at any window width — not a fixed breakpoint.
V explicitly declined both a 1440px fixed threshold and keeping V2's 640px.

Implementation notes: measure the title's needed width against available space
(ResizeObserver or equivalent — the canvas already measures post-render, see
`DebateCanvas`'s height measurement for the house pattern) and collapse
less-used controls the moment the title would be squeezed below it. No magic
number (AC-76: the rule IS the ruled value; cite DR-160). The 34px→159px→full
progression must be provable: an enforced test that fails when a crowded bar
stops collapsing. State which mutation kills it.
