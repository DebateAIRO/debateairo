# S03 pass 1 — the orchestrator's reading of the package (no lens packet names this file)

- `frames/C1-gate.out` and `C2-gate.out` read CLUSTER_RED only because their pairs (v9 24/0, 28/0) predate the later clusters' appended cases; at the head v9 is 31/0, which is C3's pair — the slice-final state is `C3-gate.out` CLUSTER_GREEN (v9 31/31, baseline 31/31).
- typecheck at the head: 1 diagnostic = the intake baseline (apps/ui/lib/v3/answerExport.ts TS2835); delta 0.
- README: COST_ENVELOPES_NOT_SEALED on 2 lines (was 3 at C2), per V-11 + V-14 / SPEC-v3 R3.4 + R3.4b.
- Carried to REV (S03 DECISIONS folds): PLAN §5 :1054-1055 "two test files" vs one; C2-2's test TITLE still says "sealed-envelope refusal".
