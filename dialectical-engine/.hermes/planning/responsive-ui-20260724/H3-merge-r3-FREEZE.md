# H3 Merge round 3 — REWORK CAP FREEZE — responsive-ui-20260724

- collected verdicts (round 3):
  - H2 r3 (Hermes): HERMES STAGE REVIEW CHANGES REQUESTED — NEW-1/NEW-2/
    NEW-4+#5 RESOLVED; pinch requirements-defect fixed but delivery contract
    incomplete (NEW-5 HIGH), collision model contradiction (NEW-6 MEDIUM)
    (H2-verdict-r3.md)
  - G3 r3 (Grok, scoped): G3 CHANGES REQUESTED — redesign direction endorsed;
    findings A (overview vs measure loop, major), B (pointer-intent model,
    major), C (non-passive GestureEvent registration, major); D minor
    (PlanReview-r3.md)
- independent convergence: H2 NEW-5 ∩ G3 B/C (intent model + iOS event
  contract); H2 overview guidance ∩ G3 A (layout-stable simplification).
  Zero contradictions between reviewers.
- rework_round: **3 of 3 — CAP REACHED.** Loop FROZEN per spine §10 law 1.
  No worker reclaim; routing hold in effect. Escalation: V STEERING REQUIRED
  → V DECISIONS PACKET (flush trigger: lane frozen).

## V STEERING REQUIRED

- ticket: responsive-ui-20260724 / C2 Plan.md (pre-board planning stage)
- reason: rework_round cap (3 of 3) reached
- rework_round: 3 of 3
- loop frozen: yes (routing hold placed)
- recurring findings that did not converge: the §b.2 gesture-delivery seam
  (iOS focal/centroid + event ownership + non-passive registration), the
  pointer-intent matrix, overview-vs-measure-loop stability, and the
  bottom-chrome collision model — all NEW or surviving items from the round-2
  redesign forced by the (correct) hard-pinch requirements change mid-flight.
  Everything else in the plan is now dual-reviewer-clean.
- last three CHANGES REQUESTED comment cursors: H2-verdict.md → H2-verdict-r2.md
  → {H2-verdict-r3.md, PlanReview-r3.md}
- smallest steering question / yes-no for V: authorize ONE final scoped
  rework (rework_round reset 1 of 2, same C2 session) limited strictly to the
  5-item consolidated list below, verified by a scoped H2+G3 pass on only
  those items?
- routed into: V DECISIONS PACKET
- comments read through: not ticketed (pre-board stage)

## Consolidated final work list (if V authorizes)

1. iOS pinch delivery contract (H2 NEW-5 + G3 C): centroid source named
   (concurrent TouchEvent coordinates or truthful alternative focal policy);
   gesturestart atomically suspends PE pan; no double mutation; native
   addEventListener with { passive: false } for gesture*/touchmove, React
   synthetic props not used; handler-contract tests for the transitions.
2. Pointer-intent matrix (H2 NEW-5b + G3 B): drag threshold (~8-10px), tap
   vs pan, post-drag click suppression, interactive-target exclusion (sticky
   toggle, zoom cluster, card controls), overview tap = zoom-to-card at 1.0,
   controls-parity path in overview; unit + Playwright smoke.
3. Overview layout stability (G3 A): layout-stable hiding (visibility/
   opacity/reserved height) OR measure freeze below READABLE_ZOOM; forbid
   display:none on height-contributing children; S4 assertion that per-card
   offsetHeight is unchanged across data-zoom-band toggle.
4. Bottom-chrome collision fix (H2 NEW-6): collapsed synthesis tab rectangle
   disjoint from the dock's expanded band at every required cell; short-height
   compact arrangement for the 4×44px zoom buttons above the 96px dock cap.
5. Auto-fit mode split (H2 guidance): column-auto vs overview-auto so resize
   cannot silently convert an overview Fit into column fit.

## V STEERING RECEIVED — LOOP UNFROZEN (V ruling, 2026-07-24)

**V amended the convergence law by authority:** the rework cap fires only on
STAGNATION — three consecutive rounds in which nothing materially changes.
A converging loop (shrinking findings, new material each round) continues.
This mission's trajectory (20 → 7 → 5 findings, round-3 items all in the
round-2-redesigned material) is convergence, not stagnation: **loop
continues.** Stagnation counter: 0 of 3 (a round with no material change
increments it; material change resets it). The spine §10 law-1 text
amendment is queued for the post-run protocol update.

- routing hold LIFTED; rework round 4 dispatched to the same C2 session,
  scoped to the 5-item consolidated list above.
- authority_epoch: 1
- comments read through: not ticketed (pre-board stage)
