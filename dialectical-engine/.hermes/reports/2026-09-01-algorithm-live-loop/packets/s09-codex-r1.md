# PACKET — codex review S09 r1 (T17 cost envelope) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17-cost-envelope.md.
Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-self.md
(create either if absent). No tests, builds, git changes, no live provider calls. Fresh session.

## 2. Immediate upstream artifacts
RULINGS FIRST: J1, J8, J12 + the entry-point class (S06 B1, F33, F34), J19, J23, D24 + ADDENDA,
D25 (migration registry), D27, D28, D30 — mission DECISIONS.md.
SPEC (FROZEN, goal 285-295):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S09-envelope/SPEC.md
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09 diff e040b1ee..HEAD`
(tip 0412689d, tree da267bdc, clean, mode changes 0; 14 files).
Report (marker line 1; line 2 `report sha256:` verified 52f514fa…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md
+ self-report beside it. Logs: .../logs/s09/ (RED-t17-envelope, GREEN-S09-C1-run{1,2,3},
MUTANTS-t17, GATE-typecheck, ZONE-unit-HEAD, PREEXISTING-paired-base-head).
Verify, priority order:
(1) THE ARITHMETIC, recomputed by you from the source, not from the report: the claim that
    DR-184-v2's `panelSize*(panelSize−1)` counts buildCrossRootExchangePlan's exchange NODES
    rather than panel calls, so the panel leg was ABSENT; that the real term is (M−1) ×
    materialized nodes; that `withCooldownRetry` spends TWO provider sequences so a cooldown
    site is 2*judge + final; that "repair" is consumed inside each site's maxAttempts loop and
    is not a separate term; and that the ceiling at M=2/d=1 moves 88 → 160. Derive 160 yourself.
(2) The serve leg = 3 × 2 = 6 sites, derived from the UNMERGED lane/s07 (runSynthesisLoop calls
    synthesize and evaluate unconditionally per round, break only on satisfied; maxRounds is the
    sealed evaluatorLoopMaxRounds). Read that lane yourself and say whether the derivation holds
    and what re-verification the merge will need.
(3) No new constant: T16's already-sealed `envelopeFormulaInputs` had no production consumer and
    is now read at both entry points with a claim-time loud stop; eight ENGINE_*/RUNNER_*
    re-declarations were removed — verify none of those removals changed a value, and that the
    loud stop fires before provider spend (J12).
(4) DoD: the maximum-path ledger-count test proves the recomputed ceiling COVERS the observed
    attempt count from the SAME ledger, panel attempts included; an over-bound input still
    refuses loudly at admission; the W12 flagship run's "envelope WITHIN at terminal" assertion
    is writable from what this lane provides — say what that run still needs.
(5) Mutants: 5 caught, 1 neighbour not caught, D24 gates throughout. The seat discloses that its
    own v2-refusal assertion pinned "some field is missing" and survived making two members
    optional, repaired by pinning each disclosure field — check the repaired assertions.
(6) Findings F-S09-1..5 (deploy boundary; silent NaN ceiling fixed in lane; two authority reds
    caused by fake pools matching pg_advisory_lock instead of pg_try_advisory_lock; maxRecompose
    dead after T9; the acceptance claim lease roughly doubling) — are all five accurately stated?
    F-S09-3 in particular claims two entries of the mission's baseline authority are fixable
    test-double defects; assess that claim, it changes what the closure authority means.
(7) Gates at the committed tip with commit/tree stamps (D27); zone and paired base/head.
(8) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S09 r1 — APPROVE|CHANGES · comments read through: s09-r1-2026-09-02`

## 4. Stop conditions
- STATIC only; ~35 minutes; CANNOT-ASSESS over guesses. Self-report `## r1` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
