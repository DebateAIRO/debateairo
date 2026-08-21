# Hermes PROG-07 — eval-07-profiles stage verification

## Result

APPROVED branch `codex/eval-07-profiles` at `975ab60` after reading all five PROG-07 peer-review artifacts and independently verifying the lane.

## Verification performed

- `pnpm run typecheck` — PASS, exit 0.
- `pnpm test` — PASS, 96 files / 694 tests.
- Focused ruling-4 and REPLACE-not-pool run — PASS, 2 selected tests including live embedded PostgreSQL.
- Migration 0027 matches the repository's hand-written SQL conventions and was applied by the full database suite.
- Prowess ranks are partitioned by exact metric; unsuperseded consensus remains at full weight even when the same identity has settlement evidence.
- Superseded consensus is removed at the common active-observation choke point before every derivation, count, receipt, and rank, while both source rows remain append-only audit history.
- Recursive production scan across `apps/**` and `packages/**` found only the selector definition and zero production call sites.
- `git diff --check dev...HEAD` passed; the lane was clean at `975ab60`, with `a2b1f4e`, `6a05f47`, and `975ab60` all present in the ancestry.

## Review resolution

Round 1's seven distinct blockers are closed by `6a05f47`, including the fabricated-zero leniency metric and the rank-level ruling-4 violation. Round 2's sole remaining seat-A blocker was deleted judge-rank movement coverage. Commit `975ab60` restored an end-to-end harvest-driven rank flip and persisted `bias-rank:` receipt assertion; round 3 returned PASS.

## Custody and carry-forwards

- Completed `eval-07-profiles` (`t_fd6d411d`) on the durable `model-evaluator` board.
- Released `eval-09-consumer` (`t_fab7c167`) and `eval-10-seatshare` (`t_ad2ce05d`) to ready as parallel tier-6 lanes.
- Preserved ticket 10's existing selector-wiring constraints.
- Added all nine carried non-blocking notes from `PROG-07-opus-review-3.md` to ticket 10's bind-readiness pack.
- Added the seat-B identity-linked settlement-contradiction sparsity disclosure: peers without an exact identity-linked settlement receive `NONE`, so V must treat this metric as sparse before bind.
- Updated wayfinder issues 07, 09, and 10 to match board state.

## Files produced or amended

- `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-07-hermes-stage-verdict.md`
- `.hermes/reports/2026-08-14-model-evaluator/agent-reports/hermes-PROG-07.md`
- wayfinder issues 07, 09, and 10

Final verdict: `HERMES STAGE VERDICT: LANE eval-07 APPROVED`
