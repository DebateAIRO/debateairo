# REVIEW PACKET - support widget controls, close control, open/close motion

Seat: independent reviewer (Grok). One pass, one verdict. Read the code yourself;
do not trust this packet's claims about what the code does.

## What V asked for

Earlier rounds (design, already settled by V on the canvas):
1. The compact support widget's three controls stop falling back to browser defaults:
   - "Talk to a human" = ink outline pill (1.5px solid var(--ink), transparent fill,
     var(--text) label at 700 10.5px, 36px min-height, person icon).
   - "Send" = the full-page desk's ink pill (.supportSend) in a bar under the input,
     right aligned.
   - "Open full page" = centered muted mono link, 9.5px, underlined, with a gold
     up-right arrow.

This round (V, 2026-09-12), all of it to be implemented:
2. "Bare Arrow" close control at the top left of the panel, in the repo's existing
   icon-button shape (.iconBtn: 32x32, var(--r-btn), surface-2 face, line-2 border,
   text-3 ink). The arrow points INWARD, toward the dock corner the panel folds into
   (right-pointing), not outward.
3. The orange Help pill shows when the drawer is closed and does NOT show while the
   drawer is open.
4. The drawer appears with a smooth transition instead of popping into place.

## Files changed (working tree, uncommitted)

- apps/ui/components/support/SupportWidget.tsx  (rewritten)
- apps/ui/components/support/Assistant.tsx      (compact branch, close label, icons)
- apps/ui/app/globals.css                       (widget dock, compact panel controls)

Inspect with:
  git -C /Users/vladmihaimiron/Documents/DebateAIRO diff -- dialectical-engine/apps/ui
and by reading the three files.

## What to judge

A. REQUIREMENTS. Is each of 1-4 above actually implemented in the code? Name the
   file and line that satisfies each, or say it is missing.
B. ACCESSIBILITY. Focus must return to the Help pill when the panel closes (it is
   the only control left to focus). The hidden pill must be out of the tab order
   while the panel is open. The icon-only close button must carry an accessible
   name in BOTH languages (en, ro). Escape must close the panel.
C. MOTION. prefers-reduced-motion must be honoured. The panel is kept mounted
   during a "closing" phase so the exit frames can run - check that phase can never
   get stuck, that its timer is cleaned up, and that reduced motion does not leave
   the panel mounted.
D. REACT CORRECTNESS. Effect dependencies and cleanups, no state writes during
   render, no stale closure on the close path, no leak if the component unmounts
   mid-close.
E. SCOPE. The full-page Help desk (fullPage branch, .supportHeader, .supportSend as
   used by the desk, .supportEscalation) must be unchanged in behaviour. Flag
   anything altered that V did not ask for.
F. RUNTIME. Anything here that would break, in either theme (paper / chamber).

## Evidence already collected (verify rather than assume)

- `npm run typecheck` in apps/ui: clean.
- `npm test` in apps/ui: 59/59 pass.
- Browser, dev server on :3000, landing page (signed out): panel opens, Help pill is
  visibility:hidden + opacity 0 + pointer-events none + out of tab order while open;
  close arrow returns the pill and focus lands on it; Escape does the same;
  panel computed animation is `de-dockin 0.24s` with transform-origin at the
  bottom-right corner; chamber mode renders correctly.

## Verdict format (reply with exactly this shape)

VERDICT: PASS | REWORK
FINDINGS:
  1. [blocker|major|minor] file:line - what is wrong - the concrete fix
  (write "none" if there are none)
NOTES: anything worth V knowing that is not a defect.

Mark REWORK only for a real defect or an unmet requirement above. Style preferences
that V did not ask for are NOTES, not findings.
