# Opus PROG-04 peer review — self-report

REVIEWER CLAIM:
- agent: Opus (reviewer A)
- ticket: PROG-04 / codex/eval-04-tagger
- rounds: review 1 over `c15690f` (REWORK), review 2 over `670ac9a` (PASS)
- worktree reviewed: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger`
- reviews written to:
  - `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-04-opus-review-1.md`
  - `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-04-opus-review-2.md`
- comments read through: goal packet PROG-04 (three MANDATORY carry-forwards), Architecture §3.2/§3.3/§4/§5/§7 tier-2 row/§8, Requirements FR-0.6, FR-1.3, FR-2.1–2.3, coordinator round-2 instruction
- other reviewers' files: not read (per instruction)

## CURRENT VERDICT (round 2, commit 670ac9a): PASS

## Round 1 (c15690f) — REWORK, two blockers

1. Tag calls carried the product `run_id`, so each `MODEL_CALL` ledger entry was
   counted by `BudgetRepository.countRunModelAttempts` against the run's pinned
   DR-181-v1 ceiling (enforced at `apps/runner/src/index.ts:2009`) — a successful
   tag could push a live run into `RUN_COST_ENVELOPE_EXHAUSTED`, i.e. tagging
   could gate serving. Same coupling reached the liveness version-trigger
   detector and the asker-visible serve execution digest.
2. Constant `subjectItemId`/`contractHash`/`callSiteKey` meant a failed ask-time
   attempt consumed the evaluator retry tuple, so reconciliation would throw
   `CALL_BUDGET_EXHAUSTED` under `createPostgresProviderGateway`; the green
   reconciliation test passed only against a stub gateway.

Non-blockers filed: untyped timeout, invalid content collapsed into execution
failure, pre-`try` throws, no already-tagged path, migration 0025 DDL drift.

## Round 2 (670ac9a) — both blockers genuinely closed

Root fix: the provider call now passes `runId: null` with a per-attempt
`subjectItemId`, so tag evidence is structurally outside every product per-run
reader rather than special-cased in one of them. I re-traced each path myself:
budget assert skipped (`request.runId !== null` guard), `countRunModelAttempts`
`WHERE run_id=$1` excludes NULL, `countModelAttempts` returns 0 for null runs,
serve digest `WHERE run_id=$1` excludes, liveness `WHERE run_id IS NOT NULL`
excludes, battery/graph/ledger scans all run-scoped. Both `ledger_entry.run_id`
and `raw_artifact.run_id` are nullable (`0000_s00.sql:158`).

Proofs are real, not stubbed: the new integration tests drive
`createPostgresProviderGateway` with a fake `fetch`, including a run pinned at
`maxModelAttempts=1` that still tags while its product count stays at 1, a 503
ask-time failure followed by a successful reconciliation, a two-model-version
sequence that actually invokes `detectProviderModelVersionTriggers()` and yields
zero `PROVIDER_MODEL_VERSION` triggers, and a byte-identical digest comparison.

All five filed non-blockers are closed (typed `TAGGER_PROVIDER_TIMED_OUT`,
`TAGGER_CONTENT_REFUSED`, `TAGGER_INPUT_INVALID`/`TAGGER_PREFLIGHT_FAILED`/
`TAGGER_RUN_UNRESOLVED`, `TAGGER_ALREADY_TAGGED` short-circuit, and an explicit
Hermes-ratification escalation for migration 0025).

## Non-blocking notes handed to Hermes

- Ratify or reject migration 0025's REFUSED-only DDL relaxation (the one open
  decision; worker escalated it correctly).
- Record that tagger calls now persist with null `run_id`, which diverges from
  Architecture §2/§3.2's implied run-scoped tagger evidence, and that
  `assertAdmissionArtifact` now expects null-run scope for evaluator artifacts.
- `packages/providers` gained `CLASSIFIER` role + `evaluator` lane: verified
  inert (no consumers, never read at runtime, no CHECKs, no contract drift) but
  it is a product-package edit worth naming in the merge record.
- Ticket 06 must bound reconciliation retries (cross-invocation evaluator
  attempt accounting is now disabled by design); lane 05 still owes the
  `evaluator.` call-site prefix exclusion in harvest.

## Exact verification I ran at 670ac9a

- `pnpm typecheck` — PASS (clean `tsc --noEmit`).
- `pnpm run generate:contract` + `git status --porcelain` — empty, no drift.
- `npx vitest run tests/integration/evaluator-database.test.ts tests/unit/evaluator-tagger.test.ts` — 27/27 PASS.
- `npx vitest run` — 85 files / 628 PASS (matches the worker's claim).
- `pnpm lint` — `audit:architecture` 27 edge rows / `violations: []`;
  `audit:source` `blocking: []`.

(Round 1 at c15690f: typecheck clean, 85 files / 619 PASS, audits clean.)

## Scope evidence

Read-only outside my two output files across both rounds. No commits, no board
mutations, no branch/worktree changes, no pushes.
