# PACKET — codex review S07 r3 (J29 implemented) · rework 2/3, one round remains · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T09-synthesis.md.
Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-r3.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-self.md
(append `## r3`). No tests, builds, git changes, no live provider calls. Fresh session; your r2
verdict defines the scope.

## 2. Immediate upstream artifacts
RULINGS FIRST: J29 (store typed artifact references, not content; the reader takes ownership and
lease; the round arm runs against an ENCRYPTED run; a transcript field, if genuinely required, is
an encrypted carrier with a sentinel), J24, J25, J26, D24 + ADDENDA, D27 ADDENDUM-3, D35, D38 —
mission DECISIONS.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07 diff e040b1ee..HEAD`
(tip 1a74eb33, 9 commits, clean, 0 mode changes; this round has TWO content commits — the J29
redesign and a fix a surviving mutant forced — and every gate was re-run from scratch at the tip;
the orchestrator re-checked the nine r4f-gate records with the final-form comparator: none stale).
Report (marker line 1; line 2 `report sha256:` verified 535ddde2…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s07-synthesis.md
Verify, priority order:
(1) J29's core: `candidate_artifact_ref` and `evaluator_artifact_ref` are uuid NOT NULL
    REFERENCES ledger.raw_artifact; the candidate statement, evaluator request and verdict are not
    stored (the orchestrator's grep for the four old columns returned nothing — confirm).
(2) THE ONE RETAINED BODY, which the seat asks you to push on and which is the round's real
    question: it argues the DoD's verbatim-objection claim is about the REQUEST AS SENT, which
    ledger.raw_artifact cannot answer because raw_text is the response and input_hash is null for
    encrypted runs — so it keeps one field as an ENCRYPTED CARRIER with the sentinel: a branch in
    core.enforce_content_ciphertext extracted from 0038 rather than retyped and inserted before
    its fail-closed ELSE, trigger attached, content_attestation bytea, and serve.synthesis_round
    added to CONTENT_CARRIERS with the carrier count moving 14 → 15 in both the round-trip and
    plaintext-rejection lists. Test the argument: is there a way to satisfy the DoD from artifacts
    alone? If yes, the column goes. If no, verify the carrier is complete — no plaintext path, the
    trigger actually fires, and the count change is asserted in both lists.
(3) The reader: ownership via core.run_is_owned_by (the same predicate the projection uses), read
    under withRunContentLease, decrypted under the round's own key.
(4) Resolvability before commit: every distinct reference must belong to this run; a cross-run
    reference raises SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED and rolls the whole answer back; the
    oracle JOINS through artifact.run_id = answer.run_id rather than pattern-matching (D35's shape
    applied correctly — confirm the join is the oracle).
(5) THE MUTANT THAT CAUGHT THE SEAT, and the bug behind it: R4M1 (write the request in plaintext
    on an encrypted run) SURVIVED the first campaign because the encryption suite built its row BY
    HAND — schema tested, writer never. Driving the round through `persist` killed it and exposed
    a real defect: the same-run proof counted ROWS, so a round naming ONE artifact for both roles
    (the identical-role-refs case T16 warns about) was wrongly refused; it now counts DISTINCT
    references. Verify both the fix and that the encryption suite now exercises the writer.
(6) Evidence: cluster ×3 63/63; zone 13 failed/1347 set-equal; database 1 failed/82 pre-existing;
    crypto 48/48; typecheck 0; surface gates only the pre-existing error; fifteen mutants across
    four campaigns with clean gates; one RSS load flake disclosed and not recurring.
(7) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S07 r3 — APPROVE|CHANGES · comments read through: s07-r3-2026-09-02`

## 4. Stop conditions
- STATIC only; ~40 minutes; CANNOT-ASSESS over guesses. Self-report `## r3` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
