# Hermes PROG-06 — eval-06-addon stage verification

## Result

APPROVED branch `codex/eval-06-addon` at `40a7eea` after reading all six peer-review artifacts and independently verifying the lane.

## Verification performed

- `pnpm run typecheck` — PASS, exit 0.
- `pnpm test` — PASS, 92 files / 682 tests.
- Full focused add-on run — PASS, 2 files / 18 tests.
- Selected spot-check — PASS for the blinded gateway payload, code-level same-maker refusal, DB acceptance of a different-maker null-run grader, and both 12-concurrent/max-10 regression shapes.
- Same-run concurrency produced one grade/call plus eleven typed in-flight skips and left the pool usable.
- Distinct-run concurrency produced twelve grades/calls and left the pool usable.
- Focused DB execution accepted the lawful null-run/different-maker observation and rejected the same-maker observation with `PRODUCER_GRADING_FORBIDDEN`.
- `git diff --check dev...HEAD` passed; the lane worktree remained clean.

## Ratification

I ratified migration 0026's amendment of Architecture §3.4 from a product-run-scoped grader predicate to `grader_run IS NULL` semantics. The evaluator gateway is intentionally invoked with `runId: null`; retaining `grader_run = NEW.run_id` would reject every lawful insert. The graded artifact must still belong to the product run and maker equality remains forbidden. I updated Architecture §3.4 and §5.3 with the amendment note and corrected trigger body.

## Custody and handoffs

- Completed `eval-06-addon` (`t_2041f591`) on the durable `model-evaluator` board.
- Unblocked `eval-07-profiles` (`t_fd6d411d`) to ready with its existing binding REPLACE-not-pool handoff: a settlement row naming a consensus observation supersedes it for derivation; both rows must never be pooled or counted independently.
- Commented `eval-10-seatshare` (`t_ad2ce05d`) with seat-B N5: a `ProviderGateway` sharing the evaluator repository pool reintroduces nested checkout while the lock client spans the provider call and deadlocks at sufficient concurrency (measured 14/max-10). Wiring must use a separate gateway pool or thread the client. PROG-04 F3 travels with it: source the evaluator isolation set from the register at the composition root before bind.
- Updated matching wayfinder notes: lane 06 done, lane 07 ready, migration ratification recorded, selector constraints carried.

## Files produced or amended

- `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-06-hermes-stage-verdict.md`
- `.hermes/reports/2026-08-14-model-evaluator/agent-reports/hermes-PROG-06.md`
- `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md`
- wayfinder issues 06, 07, and 10

Final verdict: `HERMES STAGE VERDICT: LANE eval-06 APPROVED`
