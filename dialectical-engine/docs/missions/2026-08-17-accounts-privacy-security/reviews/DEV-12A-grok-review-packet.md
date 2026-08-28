# DEV-12A Grok review packet

Verdict requested: exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1
file/line evidence and the smallest repair. This is a read-only review of one
small Kanban-sized change; do not edit the repository.

## Ticket

**DEV-12A · Wire terminal activation evaluation into the production runner**

The production runner must inject the existing recorded-facts terminal
activation evaluator. A runner that reaches answer completion with outstanding
WAIT rows must not fail merely because its executable entrypoint omitted that
already-implemented dependency.

## Review boundary

- `apps/runner/src/main.ts`
- `tests/architecture/dev-runner-terminal-evaluator.test.ts`
- the two DEV-12A/local-QA rows in
  `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

Treat every unrelated dirty-worktree file as out of scope.

## Evidence

- RED before the production edit: focused architecture test `0/1`; the exact
  `createTerminalActivationEvaluator` import/wiring was absent.
- GREEN after the production edit: focused architecture plus the evaluator's
  recorded-facts behavior suite `12/12`.
- Root `pnpm typecheck`: GREEN.
- `git diff --check` over the bounded files: GREEN.
- The production change is exactly one import addition and one constructor
  setting: `resolveTerminalActivations: createTerminalActivationEvaluator(pool)`.
- No fallback evaluator, blanket activation result, runtime value, provider,
  lifecycle, publication flag, migration, or authorization boundary changed.
- Review capability was unavailable. An
  authorized unsandboxed Grok 4.6 attempt reached the service but returned
  `402 Grok Build usage balance exhausted`; the user-approved Claude Opus
  fallback returned `OAuth session expired and could not be refreshed`. On
  2026-08-27 the user explicitly waived the unavailable independent-review gate
  for DEV-12A, so its implementation and focused receipts close the ticket.

## Review questions

1. Is the evaluator constructed from the same restricted runtime pool used by
   the runner, preserving its existing recorded-facts and database-role checks?
2. Is the wiring at the real `apps/runner/src/main.ts` entrypoint and before any
   work item can reach terminal completion?
3. Does the test non-vacuously prevent removal or replacement with an ad-hoc
   async evaluator while avoiding claims about runner startup or publication?
