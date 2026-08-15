# PROG-04 Codex report — ask-time evaluator tagger

WORKER CLAIM:
- agent: Codex GPT-5.6 Sol
- ticket: PROG-04 / eval-04-tagger
- worker CLI session id: 01a00460-b63c-7492-a546-a3759f8bb9a8
- branch/worktree: `codex/eval-04-tagger` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger`
- assignment type: rework_round_1 (same goal/session/worktree)
- reviews read through: `PROG-04-opus-review-1.md` and `PROG-04-opus2-review-1.md`, 2026-08-15
- board mutation: prohibited and not performed

## Outcome

Closed the shared reviewer root defect by moving evaluator model attempts entirely outside the product-run ledger scope. `runEvaluatorQuestionTagger` now calls the provider gateway with `runId: null` and a fresh evaluator attempt subject. Product correlation remains only in evaluator-owned `domain_admission`, `question_domain`, and `pipeline_event` rows. The raw artifact and `MODEL_CALL` ledger entry therefore have null `run_id` by construction.

This prevents evaluator calls from consuming `BudgetRepository.countRunModelAttempts`, exhausting a product envelope, consuming the reconciliation tuple, appearing in `ServeRepository.readExecutionLedgerDigest`, or entering `LivenessRepository`'s `(run_id, provider_ref)` model-version partitions. Artifact validation now requires null-run scope for the pinned evaluator provider while retaining source-run validation for non-tagger repository callers.

Rework commit: `670ac9a` (`fix(evaluator): isolate tag attempts from product runs`). Original implementation commit: `c15690fd7444589352017208a166510e3e322464`. No push was performed.

## Rework carry-forwards closed

- Envelope/serve isolation: a run already at its one-attempt product ceiling still tags successfully, keeps the product attempt count at one, and its served answer remains readable.
- Reconciliation isolation: a failed ask-time evaluator attempt no longer causes `CALL_BUDGET_EXHAUSTED`; reconciliation reaches the provider and tags successfully.
- Liveness isolation: two evaluator calls spanning `local/evaluator:v1` and `v2` persist null-run artifacts and ledger rows and create zero product `PROVIDER_MODEL_VERSION` triggers.
- Digest isolation: the asker-visible execution-ledger digest is byte-identical before and after evaluator tagging.
- Timeout handling: `ProviderCallFailedError.lastOutcome === TIMED_OUT` produces `UNTAGGED/TAGGER_PROVIDER_TIMED_OUT` and a typed FAILED pipeline receipt.
- Preflight handling: invalid inputs, repository preflight failure, and an unresolved persisted run return typed `UNTAGGED` results rather than escaping exceptions.
- Retry idempotency: an existing question-domain link short-circuits before provider/admission work, records `SKIPPED/TAGGER_ALREADY_TAGGED`, and leaves exactly one admission receipt.
- Unresolved `SELECT_EXISTING`: persists a `REFUSED` admission receipt with `EVALUATOR_DOMAIN_SELECTION_UNRESOLVED:<id>` and leaves the run untagged.
- Call labels: replaced misleading `JUDGE` / `critic-exempt` labels with `CLASSIFIER` / `evaluator`.
- Invalid provider content is distinguished as `UNTAGGED/TAGGER_CONTENT_REFUSED`.

## RED → GREEN evidence

RED under product-run coupling:
- Focused integration run: 3 failures / 14 passes. The ceiling test returned `UNTAGGED` instead of `TAGGED`; reconciliation returned `UNTAGGED` instead of `TAGGED`; the digest gained a product-run evaluator `MODEL_CALL` entry.
- Dedicated liveness reproduction after permitting both calls: expected zero product triggers, received one (`PROVIDER_MODEL_VERSION`).
- Carry-forward unit run: 4 failures / 4 passes for null-run/correct labels, typed timeout, typed preflight failure, and retry short-circuit.

GREEN after decoupling:
- Focused final run: 4 files / 42 tests passed.
- Full final run: 85 files / 628 tests passed.
- Both artifact and ledger assertions prove `run_id IS NULL` for the two-version evaluator sequence.

## Exact verification

- `pnpm typecheck` — PASS (`tsc --noEmit`).
- `pnpm exec vitest run tests/unit/evaluator-tagger.test.ts tests/unit/evaluator-domains.test.ts tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-database.test.ts` — PASS, 4 files / 42 tests.
- `pnpm run audit:source` — PASS, `blocking: []`.
- `pnpm run audit:architecture` — PASS, 27 edge rows checked / `violations: []`.
- `pnpm test` — PASS, 85 files / 628 tests.
- `git diff --check` — PASS before commit.
- Branch check — `codex/eval-04-tagger`.
- DR-179 scoped scan — no API key, authorization header, bearer secret, remote endpoint, or new `BOUND` state introduced. Existing `UNBOUND` declarations remain unchanged.
- No `skeleton/` file changed; VERSION/CHANGELOG/upgrade-guide rules do not apply. The repository does not contain the skeleton template scripts named by root AGENTS.md.

## Migration 0025 disclosure — Hermes ratification required

The original implementation commit includes `migrations/0025_evaluator_domain_refusal_receipts.sql`. It drops and replay-safely recreates the `domain_admission` proposed-name and normalized-name CHECK constraints so blank values are permitted only when `decision = 'REFUSED'`; every non-REFUSED decision retains the nonblank guarantee. This DDL relaxation is what allows a blank model proposal/refusal to leave the required typed receipt. Rework round 1 did not alter that migration. Hermes must explicitly ratify or reject this relaxation at integration review; rejection requires a different persisted representation for blank refusal receipts before merge.

## Scope and residual risk

Changes are limited to evaluator package/worker/docs/tests plus compile-time provider role/lane vocabulary. No product routing, dispatch, budget, liveness, serving, memory, or settlement implementation was changed. The tagger remains collect-only and `UNBOUND`; no production call-site wiring was added.

The production composition root still must provide the registered evaluator family, selected local catalog model gateway, deployment maker capability, and registered call bound. Runtime vLLM behavior is covered through the real persistence/provider wrapper with deterministic local fetch doubles; no external model call was made.

## Continuation verification after known CLI hang

The original worker/session resumed on 2026-08-15 with the worktree clean at
`670ac9a8e27ae7f36ccb4a8af8df3dda955f0df5`; no recovery edits or additional
commit were needed.

- Focused command rerun: `pnpm exec vitest run tests/unit/evaluator-tagger.test.ts tests/unit/evaluator-domains.test.ts tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-database.test.ts` — PASS, 4 files / 42 tests.
- Repository typecheck rerun: `pnpm typecheck` — PASS, `tsc --noEmit` exit 0.
- Post-check worktree status: clean; rework commit remains `670ac9a`.

READY FOR PEER REVIEW:
- worker: Codex GPT-5.6 Sol
- worker CLI session id: 01a00460-b63c-7492-a546-a3759f8bb9a8
- ticket: PROG-04 / eval-04-tagger
- branch/worktree: `codex/eval-04-tagger` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger`
- commit SHA: `670ac9a`
- reviews read through: both round-1 reviewer reports listed above
- tests/checks: all exact evidence listed above
- open decision: Hermes must ratify or reject migration 0025's REFUSED-only DDL relaxation
