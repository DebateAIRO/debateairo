# RUNTIME_BASE — missing evaluator rankings type contract

- Ticket: `t_6612154e`
- Investigator/session: `/root/preview`
- Frozen source base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Mode: read-only; no product or test file was changed for this finding.

## Finding

`apps/api/src/index.ts:64` imports `EvaluatorRankingsView` with an `import type`
from `packages/evaluator/src/rankings.js`, but `packages/evaluator/src/rankings.ts`
does not exist. It is absent from the current source checkout, the frozen base,
all reachable git object paths/refs, and all local mission worktrees. It is
neither ignored nor untracked.

This is a TypeScript compilation diagnostic, not a support-preview runtime
dependency. The import is type-only and therefore erased by `tsx`.
`apps/api/src/main.ts` does not construct or pass the optional
`evaluatorRankings` application, so `/v1/evaluator/rankings` is not installed
by the current product entrypoint. The unit test exercises the optional route
with an injected mock; it does not prove runtime wiring.

## Evidence

- `apps/api/src/index.ts` SHA-256:
  `09fb43043584e1d5a13bbd29a804e161ebbbe4c955381c48b6c6b6e6c494dbee`
- `tests/unit/evaluator-rankings-api.test.ts` SHA-256:
  `43e9ac5830f6c08bd04c7e8e49d5c4ea23b8770870b589ca2f8b3250c8b35aa8`
- `packages/evaluator/src/index.ts` SHA-256:
  `c74c8ad5b840309fb5f1131dafa95339043b807d9bb20d9a99da725fee3c28bf`
- The test hash is byte-identical at frozen base `b7ca2c41`.
- `git rev-list --all --objects` contains no
  `packages/evaluator/src/rankings.ts` or `.js` path.
- A filesystem search across the source checkout and local mission worktrees
  found no rankings module.

## Smallest separate restoration scope

For compile-only contract restoration, add
`packages/evaluator/src/rankings.ts` with the DTO evidenced by
`tests/unit/evaluator-rankings-api.test.ts`, export it from
`packages/evaluator/src/index.ts`, and import the type through
`@debateai/evaluator` in `apps/api/src/index.ts`. Verify the existing unit test
and typecheck. Do not claim rankings as exposed runtime behavior.

Actual runtime exposure is a larger feature: it requires an evaluator rankings
repository/application, `apps/api/src/main.ts` wiring, and an explicit decision
about evaluator-schema read authority. Existing main wiring and grants do not
provide those pieces, so they must not be inferred from the optional API route.
