# READY FOR PEER REVIEW — PROG-08

- Worker/session: Codex GPT-5.6 Sol, goal thread `01a001d2-712d-7840-bc83-c16c6d41886f`
- Ticket/lane: PROG-08, PROGRAMMING row 1B
- Branch/worktree: `codex/eval-08-metering` at `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering/DebateAI-V3`
- Commit: `ae14b46f95b8f26349da04c594a7d302021c49cd`
- Push: not performed
- Comments read through: goal packet dated 2026-08-14; no board comments were fetched or mutated, per packet constraint

## Outcome

- Widened the shared CLI completion seam with observed-only usage.
- Claude and Grok now capture the token/cost values already present in their CLI envelopes.
- Relay HTTP responses emit OpenAI-shaped `usage` with `x_cost_usd`; Codex emits explicit `usage: null` and is never estimated.
- The OpenAI-compatible provider gateway parses optional standard/vLLM usage, tolerates vendor extensions, and persists the exact block (or null) in `raw_artifact.metadata_json` without changing request/choice semantics.
- Added `EvaluatorMeteringRepository.recordCall` to project completed calls into `evaluator.model_call_usage`, enforcing metered/unmetered table invariants.
- Added observed-only `relative-external-spend/v1` normalization with metered/unmetered counts. Local vLLM external spend is structurally 0; paid remote calls without observed USD remain UNKNOWN.

## Changed files

- `acceptance/relay-core.ts`
- `acceptance/claude-relay.ts`
- `acceptance/grok-relay.ts`
- `acceptance/model-shim.ts`
- `packages/providers/src/index.ts`
- `packages/evaluator/src/index.ts`
- `acceptance/claude-relay.test.ts`
- `acceptance/grok-relay.test.ts`
- `acceptance/model-shim.test.ts`
- `tests/unit/provider.test.ts`
- `tests/unit/evaluator-foundation.test.ts`
- `tests/unit/dr181-discovery.test.ts`
- `tests/integration/evaluator-database.test.ts`

No registry/domain files, migrations, skeleton templates, API-key surfaces, or sibling-lane files were changed.

## RED → GREEN evidence

- RED: the new provider persistence assertion expected the observed usage block and received `undefined` on the baseline implementation.
- GREEN: relay, provider, evaluator normalization, and real-PostgreSQL projection checks all pass. The database test reads back one METERED row with tokens/USD and one UNMETERED row whose usage columns are all null.

## Verification

- `pnpm test` → 83 files passed, 599 tests passed.
- `pnpm exec vitest run --config acceptance/vitest.config.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts acceptance/model-shim.test.ts` → 3 files passed, 18 tests passed.
- `pnpm exec vitest run tests/unit/provider.test.ts tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-database.test.ts` → 3 files passed, 22 tests passed.
- `pnpm typecheck` → pass.
- `git diff --check` → pass.
- From harness worktree root: `bash tests/render-templates.sh && bash tests/lint-templates.sh` → pass; templates rendered successfully and lint exited 0.
- Final `git status --short --branch` → clean on `codex/eval-08-metering`.

## Risks / review focus

- Usage is intentionally partial when a CLI reports only one token component; absent fields are omitted and never inferred. `total_tokens` is emitted only when both observed input and output counts exist, using their exact sum.
- Projection is exposed through the evaluator repository boundary; callers must classify runtime as `PAID_REMOTE` or `LOCAL_VLLM` explicitly rather than guessing from token volume.
- No currency/billing UI or manual price table was introduced.

READY FOR PEER REVIEW: codex/eval-08-metering
