# PACKET — worker T6B (V-authorized documentation corrections; no behaviour change) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T6B-doc-corrections.md.
V authorized this micro-ticket (DECISIONS.md tail, V-T6-codex-r3-1/2/3). It is not a rework
round; T6's rework count stays 3/3 and the lane is already merged and DONE. Your lane worktree
and its base tip are named in the dispatch message (created off the post-S06 integration tip so
no other lane has to re-merge). Never push; never merge out; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
The three findings, verbatim, in codex r3:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T6-codex-r3.md
1. N1 — provenance record: the nine r3 mutants ran at c7511826 and M17 at df59c41a (its header
   says so); the r3 zone, D16, lint and typecheck logs carry NO commit header, so their
   attribution to 67d9d9b4 is testimony-grade. Correct the report text to say exactly that.
2. N2 — the call-site comment above the negative check (packages/serve/src/index.ts, near the
   transport-arm guard, ~:1304-1309 at the T6 tip) still credits the transaction for excluding a
   concurrent review. Replace it with the true distinction: the transaction rolls the answer
   version back atomically; the shared per-run content advisory lease (taken by
   ServeRepository.persist and by recordReviewWithMeasurements) is what prevents the review
   writer from interleaving. Comment only — the code does not change.
3. N3 — the one-way-door inventory in the report lists six append-only tables written by
   `persist`; it must list all nine, adding serve.conformance_record (conditional on new composed
   content), serve.served_number_event (conditional on a served number) and
   core.run_progress_event (the terminal event), with their conditional arms. Keep the existing
   rollback, FK and inherited-UNIQUE analysis — codex confirmed those are correct.
Verify each claim against the artifact before writing it (this lane exists because two claims
were written from memory). D27: make the changes, commit once, then run the gates and stamp
each record with commit and tree id.
4. ADDED 2026-09-02 (T7's finding, comment-only, same lane because both are prose fixes on
   merged code): the T16 guard "finds no hardcoded policy anywhere" flags
   packages/propagation/src/index.ts:922 — a comment written by the T7B change that explains the
   defect by quoting the sealed movement value 0.25. Reword it so the prose names the quantity
   without the number (a comment quoting a tunable value becomes false when V retunes the row).
   Prove the guard green afterwards by running tests/architecture/t16-algorithm-register-rows.test.ts.
Gates: root typecheck at the committed tip; the t06 clusters (tests/unit/t06-review-teeth.test.ts
and tests/integration/t06-review-teeth-database.test.ts) once, to show the comment change moved
nothing; mode-change count 0. No mutants are required for a comment.

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — T6B (V-authorized corrections) · comments read through: t06-codex-r3-2026-09-02`;
line 2 `report sha256:`; the `## T6B` section and the self-report entry precede the marker.

## 4. Stop conditions
- If any correction would change behaviour, stop and say so — this ticket may not alter code.
- Final message = `FILED: <path>` + marker + the typecheck and cluster records with their
  commit/tree stamps.
