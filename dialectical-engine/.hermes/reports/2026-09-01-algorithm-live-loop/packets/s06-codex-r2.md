# PACKET — codex review S06 r2 (answers your r1: B1-B3, N1-N3) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T10-T11-selection-label.md
(rework_round 1, status waiting_review; two worker rounds remain). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-self.md
(append `## r2`). No tests, builds, git changes, no live provider calls. Fresh session; your r1 is
at agent-reports/S06-codex-r1.md (read first).

## 2. Immediate upstream artifacts
RULINGS FIRST: J16, J17 (preserved history readable: served_root_rule wire = two-member enum of
live + retired, nullable; PreservedConditionMarkRecord the only history carrier; persist refuses a
retired rule on a non-superseding answer; 0055's CHECK = declared history VALIDATED — ruled lawful
without a block), D24 + ADDENDUM-2 (harness refuses a dirty tree), J12 (claim-time loud stop), D25:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
SPEC: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S06-selection-label/SPEC.md
THE WORK:
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s06 diff 7433be7..HEAD`
  (tip a10c2254; commits from base 7; this round = `git diff 3665302a..HEAD`;  25 files changed, 2165 insertions(+), 65 deletions(-); mode changes 0; clean).
- Report (line 1 marker; line 2 `report sha256: 63faa56adf912d4082e78032dd401eaeb6f7646f0da5357d7d6ba15c0de3f7f0` verified; r2 section begins at line 357):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s06-selection-label.md
  + self-report `## r2` in s06-selection-label-self.md beside it.
- Logs: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s06/r2/
  (b1-RED-entrypoint/claimtime, b1-GREEN-*, b2-RED/GREEN, b3-RED-typecheck/runtime, b3-GREEN,
  root-typecheck-r2, n1-acceptance-typecheck(+BASE), refutation-d24 block M4-omitted,
  cluster-three-runs-r2, d14 pairs, zone).
Verify, priority order:
(1) B1: dev-runner-policy.ts reads the verdictLabel family through T16's OWN reader with a
    provenance pin; main.ts passes verdictLabelPolicy; the mandatory-entry-point-settings list
    gains the row; the loud stop moved to CLAIM time beside J12's (RED showed 1 model call spent
    before the refusal; GREEN 0) — verify the claim-time placement is before any provider spend.
(2) B2: database.test.ts HYG depth-2 consumer migrated + a strengths-derived oracle a
    provider-order selector cannot satisfy; the r1 class-sweep row was FALSE (written from
    intention) — confirm the r2 sweep is from the file (grep the tip for the retired literal
    across product, tests, migrations, acceptance, docs).
(3) B3 under J17: kernel rule HISTORY; contract read enum (two members, nullable);
    ConditionMarkRecord live-only; PreservedConditionMarkRecord history-only; persist refuses a
    retired rule on a non-superseding answer; catch-up treatment lawful (no relabel, no CHECK
    violation); 0055 CHECK validated (legacy rows must satisfy the declared history — is that
    true for every existing row, i.e. could any row hold a THIRD value?); the blast-radius grep
    (nothing switches/compares on the field) — re-run it yourself; all three r1 failure cases
    have their own RED (b3-RED-runtime 4/4, plus the compile-level RED).
(4) N1: acceptance typecheck at BASE and TIP: one error, identical, pre-existing
    (adversarial-corpus.test.ts TS2741, T5 consequence → F-S06-6) — the two edited acceptance
    files compile; confirm the config used includes acceptance/ and the error is the same one
    TINT1 admitted. N2: README no longer describes provider-order selection. N3: M4-omitted
    transcript complete in D24 shape.
(5) Cluster ×3 worst-run law: C1 15/15, C2 24/24, C3 9/9, C4 5/5; D14/D16 pairs byte-identical
    (contract + kernel changed again); zone tip 13 failed/1376 vs base 13/1337 identical sets.
(6) D24 ADDENDUM-2 compliance: the harness aborts exit 3 on a dirty tree (demonstrated; the
    seat corrected a demo that printed head's exit status).
(7) New finding F-S06-7: panelPolicy is likewise absent from main.ts and dev-runner-policy.ts
    (T3's lane, same class as B1) — verify the claim; it is ticketed F33 for a separate lane.
(8) Packet review (this + /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/s06-rework-r2.md).

## 3. Handoff marker
First line: `CODEX REVIEW S06 r2 — APPROVE|CHANGES · comments read through: s06-r2-2026-09-02`

## 4. Stop conditions
- STATIC only; verbatim re-runs of recorded output only; CANNOT-ASSESS over guesses.
- ~40 minutes; round r2; the worker has two rounds left. Self-report `## r2` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
