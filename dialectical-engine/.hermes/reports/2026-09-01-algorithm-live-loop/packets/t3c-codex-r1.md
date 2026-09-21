# PACKET — codex review T3C r1 (panelPolicy + claimTimeProbe at the shipped entry point) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T3C-panel-policy-entrypoint.md
(filing r1 = rework 0/3 — J19). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-self.md
No tests, builds, git changes, no live provider calls. Fresh session.

## 2. Immediate upstream artifacts
RULINGS FIRST: J12 (claim-time loud stop BEFORE provider spend), J20 (F34 folded into this
lane's charge), J21 (F34's probe is a PURE MOVE into packages/providers with structural typing —
no new package edge; app→app imports and a second implementation were rejected on the record),
J16(b), J19, D24 + ADDENDA, D27 (change, commit once, then gates; stamp commit and tree; an
assertion no run can fail is not evidence), D28 (after a second instance of a class, publish the
enumeration) — mission DECISIONS.md.
The findings this lane closes: board/F33-panel-policy-entrypoint.md and
board/F34-claim-time-probe-entrypoint.md (same directory as the ticket).
THE WORK: diff `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c diff e040b1ee..HEAD`
(tip 056e2784a4fc…, clean, mode changes 0; 8 files +540/−80).
Report (marker line 1; line 2 `report sha256:` verified 1f46e1c9…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t3c-panel-policy.md
+ self-report beside it. Logs: .../logs/t3c/ (grep-proof, class-sweep, f34-pure-move-proof,
RED/GREEN arms, mutants M1-M5, clusters ×3).
Verify, priority order:
(1) F33: dev-runner-policy.ts reads the panel family through T16's own reader with the
    provenance pin; main.ts passes `panelPolicy`; the mandatory-entry-point-settings list gains
    the row; the claim-time stop fires BEFORE any provider call (the seat's RED showed the
    defect reaching PANEL_WEIGHTING_UNRESOLVED on a correctly sealed deployment; its first
    behavioural arm passed with the defect present because the run died earlier at
    CLAIM_BOUND_MISMATCH — check the final arm pins the exact post-gate stop, not merely "not X").
(2) F34 under J21: `probeTarget` moved into packages/providers as a PURE MOVE — the seat claims
    the body differs by exactly one line (ProviderProbeRecord → ProviderProbeObservation, the
    structural substitution J21 required). Verify with `git diff -M` or by comparing the moved
    body against apps/api's original at e040b1ee; verify NO new package edge (providers still
    depends only on kernel/register/ledger; the record and store types declared structurally);
    verify apps/api's call site is unchanged in behaviour; verify main.ts composes
    `claimTimeProbe` and that a member with no configured target yields CLAIM_GATEWAY_UNRESOLVED
    rather than a silent pass.
(3) F34's disclosed gap: its entry-point arm has NO pre-implementation RED — its RED is mutant
    T3C-M2 from a clean tip. Rule whether that is adequate for a wiring change of this shape.
(4) The runner env schema gained PROVIDER_PROBE_TIMEOUT_MS (same key, shape and default 5000 as
    the API already reads) — is duplicating the key the right call versus a shared declaration?
(5) The provenance guard changed shape mid-lane: the first form tried to bend a sealed
    register_row (append-only by trigger, refused), so it now runs through a read facade that
    writes nothing. Does the guard still discriminate?
(6) D24 mutants M1-M4 caught, M5 neighbour not caught — spot-check two transcripts for the
    literal token and the three gates. (7) The seat reports two of its own defective assertions
    (one unfailable, one whose LIMIT read two rows for the same member), both caught by running,
    not by eye — confirm the filed versions are sound. (8) `git diff --stat e040b1ee..HEAD --
    packages/judgement` empty (T3's semantics untouched); scaffold violation set byte-identical
    to base; DR-181/182 tests untouched and green. (9) Packet review.

## 3. Handoff marker
First line: `CODEX REVIEW T3C r1 — APPROVE|CHANGES · comments read through: t3c-r1-2026-09-02`

## 4. Stop conditions
- STATIC only; ~30 minutes; CANNOT-ASSESS over guesses. Self-report `## r1` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
