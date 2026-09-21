# PACKET — codex review T6 r3 (answers your r2: B1, N1, N3 — the worker's FINAL round) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T06-review-teeth.md
(rework_round 3 — the worker has NO round left; anything blocking becomes a V DECISIONS PACKET
row, not a round 4 — say so explicitly). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T6-codex-r3.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T6-codex-self.md
(append `## r3`). No tests, builds, git changes, no live provider calls. Fresh codex session;
your r1/r2 verdicts are at agent-reports/T6-codex-r1.md and T6-codex-r2.md (read r2 first).

## 2. Immediate upstream artifacts
RULINGS FIRST: J14 + ADDENDUM, D21, D24, J16(b) (mode-change count law), the one-way-door
clause text in agent-reports/t05-edges.md:415-421 — DECISIONS.md at
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md.
THEN the work:
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t6 diff 7433be7..HEAD`
  (tip 045f02a8; commits from base 12; this round = `git diff df59c41a..HEAD`; mode changes 0;
  tree clean — verified by the orchestrator).
- Report (line 1 marker, line 2 `report sha256: c5671cd177cd22b19294a9d813c2a78c2913eb46ee6a5274ea13b9d2447cb56e` verified; r4 section at heading
  `# T6 TEETH r4`, line 863):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t06-teeth.md
  + self-report `## r4` in t06-teeth-self.md beside it.
- Logs: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t06/
  (r4-red1-b1-typecheck.log, r4-red2-b1-placement.log, r4-green{1,2,3}-*.log,
  r4-homonym-sweep.log, r4 mutants M18/M19/M20, zone ×3, D16 pairs, lint pairs, orphans).
Verify, priority order:
(1) B1 CLOSED STRUCTURALLY: `readNodesForRun` result restored to the ledger vocabulary
    (`StoredNodeReviewOutcome` citing migrations/0019:8) + three guards — exhaustive switch,
    mutual-assignability check against the contract's NodeReview.outcome, and a SOURCE
    assertion that exactly ONE narrowed review-outcome read exists in serve (the placement
    guard). Is the source assertion robust (what does it grep, can a rename evade it), and is
    the copied comment gone? The homonym sweep (r4-homonym-sweep.log): all five remaining
    one-value `cannot-assess` types classified disclosure-side or post-discriminant — verify
    two of them yourself.
(2) Mutants M18 (re-narrow the ledger read → placement guard), M19 (narrow the alias → compiler
    three ways), M20 (reorder union → correctly uncaught): D24 shape, headers with the real tip.
(3) N1: (a) provenance now from log headers (r3 mutants at c7511826; r3 gates at 67d9d9b4;
    r4 at 7f513173) — spot-check three headers; (b) atomicity explanation = the exclusive
    per-run content advisory lease taken by both `persist` and `recordReviewWithMeasurements`
    (verify `acquireRunContentLease` and that the review writer takes it); (c) F-T6-7 relabelled
    NOT VERIFIED with the structural requirement routed to V.
(4) N3: mode restored (blob 7cc835a5 both sides), count 0.
(5) F-T5-10 answered explicitly (tables written, rollback behaviour, why the new FK cannot
    dangle, the inherited UNIQUE(node_id) door) — is the answer true?
(6) New finding F-T6-8: the scratchpad root is SHARED between concurrent seats (the S06 seat's
    harness replaced this seat's at the same path) — assess the fleet risk statement.
(7) Gates: zone 6 failed / 221 passed ×3, membership hash 288d4f14… byte-identical to r3 and
    to your own recomputation; D16 pairs; lint pairs; orphans; EXIT STATUS lines present.
(8) The three V-row drafts (filter-exclusivity, seat-scoped scratchpad paths, standing
    homonym clause) — truthful and decision-shaped?
(9) Packet review (this packet + /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t06-rework-r3.md).

## 3. Handoff marker
First line: `CODEX REVIEW T6 r3 — APPROVE|CHANGES · comments read through: t06-r3-2026-09-02`

## 4. Stop conditions
- STATIC only; verbatim re-runs of recorded output only; CANNOT-ASSESS over guesses.
- ~35 minutes; codex round r3 = the lane's LAST review before judge verdict.
- Self-report `## r3` BEFORE the marker. End with PREDICTIONS.
- Final message = `FILED: <path>` + VERDICT line + finding count.
