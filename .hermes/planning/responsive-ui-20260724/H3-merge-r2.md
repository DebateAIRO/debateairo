# H3 Merge/Reconcile — round 2 — responsive-ui-20260724 (Claude-Router record)

- collected verdicts:
  - H2 r2 (Hermes-Verifier, resumed session): HERMES STAGE REVIEW CHANGES
    REQUESTED — dispositions on its 7: 5 resolved, #5 weakened, #3 not
    resolved; NEW-1 HIGH, NEW-2 HIGH, NEW-3 MEDIUM, NEW-4 MEDIUM
    (H2-verdict-r2.md)
  - G3 r2 (Grok, resumed session): **G3 PASS** — 13/13 resolved or recorded
    sanely; 3 new minors #14-#16, explicitly non-blocking (PlanReview-r2.md)
- ARCH→REQ return executed (spine §7 feedback edge): H2 #3 (pinch as
  completion condition vs buttons-binding) could not be resolved in-plan —
  single bounded question routed to V through the REQUIREMENTS surface.
  **FIRST ANSWER VOIDED — V declared it a misclick ("REVERT. IT WAS A
  MISSCLOCK") within minutes; no rework was dispatched on it. The question
  was re-presented; the ruling recorded below in the amendment is the
  binding one.**
- **V RULING (binding, re-asked question, 2026-07-24): "Pinch is a hard
  requirement."** Two-finger pinch-zoom on the debate tree MUST WORK on iOS
  Safari, Android Chrome, and desktop trackpads as a mission completion
  condition. H2 #3 is upheld by requirements authority: buttons are necessary
  but NOT sufficient; no plan-level residual may waive pinch on any floor
  browser. The plan's §b.2 must be redesigned around a technically credible
  per-platform delivery path with hard real-device acceptance gates.
- adjudication of reviewer disagreement (PASS vs CHANGES REQUESTED): H2's
  remaining items carry specific file:line evidence (incl. checkable
  arithmetic on NEW-2: 408+404×3=1620px → true fit 0.198 < clamp 0.5);
  G3's contrary positions are general-pass statements that do not engage
  those specific citations. Union law (no finding dropped) routes all
  evidence-backed items to rework. Convergent independent finding: H2 NEW-3
  ≈ G3 #16 (expanding token dock breaks fixed offset assumptions).
- merged verdict: HERMES STAGE REVIEW CHANGES REQUESTED (narrow union below)
- rework work list (round 2 of 3, same C2 session):
  1. V's pinch ruling (hard requirement): redesign §b.2 so pinch is a
     COMPLETION CONDITION on every floor browser. Requires a credible
     per-platform delivery design (e.g., Pointer-Events two-pointer tracking
     on Chromium-class; iOS Safari path via its native gesturestart/
     gesturechange/gestureend scale events or an equivalently reliable
     mechanism; explicit canvas pan strategy compatible with gesture capture
     — including, if needed, custom pan under restricted touch-action ON THE
     CANVAS ONLY, with page-level pinch zoom preserved outside the canvas for
     accessibility), per-browser hard acceptance gates with real-device
     evidence in §d.5, and removal of every pinch residual/waiver path.
     Failure to deliver pinch on a floor browser is a mission BLOCKER
     escalated to V — never a residual.
  2. H2 NEW-1: S2 lands green harness self-tests ONLY; each behavioral slice
     (incl. S1b) brings its own targeted RED immediately before implementation.
  3. H2 NEW-2: truthful fit policy (computed fit below 0.5 with readability
     treatment, bounded-subtree fit, or renamed contract) + define global
     min/max zoom bounds.
  4. H2 #5-weakened + NEW-4: add AuthGate states (checking/locked/invalid/
     submitting) for the three protected routes and landscape/short-height
     (width × height) cells to §d.6/§d.7.
  5. H2 NEW-3 + G3 #16: collision map reserves disjoint RECTANGLES incl.
     expanded dock/unlock-form state; measured dock height variable or max()
     clearance; collision test in owning slice gates, not only S8.
  6. G3 #14: S1b safe-area GREEN = structural/CSS asserts; computed non-zero
     inset is an S8 real-device (or residual) gate.
  7. G3 #15: widen S3 DebatePageClient contract for scoring-status relocation
     or declare it pure-CSS.
- G3's PASS stands for the G3 lens; round-3 re-review is H2-only unless the
  rework materially changes G3-lens material.
- REWORK ROUND: 2 of 3 (cap = 3; one round of headroom remains)
- authority_epoch: 1
- comments read through: not ticketed (pre-board stage)
