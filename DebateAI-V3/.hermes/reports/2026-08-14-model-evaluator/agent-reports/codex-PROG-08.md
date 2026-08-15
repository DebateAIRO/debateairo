# READY FOR PEER REVIEW — PROG-08 (rework round 1)

## REWORK ACKNOWLEDGED — round 1

- Trigger: `PROG-08-opus-review-1.md`, read in full on 2026-08-15.
- Binding findings: (1) complete and persist the versioned `relative_cost_cell` surface; (2) restore additive-only relay tolerance for absent cost and permissive `modelUsage` values.
- Cheap follow-ups accepted: assert retained local utilization, align the mean-spend denominator without imputing absent spend, and retain usage independently of completion-schema validity.
- Comments read through at rework dispatch: Opus peer review 1; Grok review was unavailable due provider outage. A late Grok artifact was subsequently inspected and classified as stale first-pass evidence below.

- Worker/session: Codex GPT-5.6 Sol, goal thread `01a001d2-712d-7840-bc83-c16c6d41886f`
- Ticket/lane: PROG-08, PROGRAMMING row 1B
- Branch/worktree: `codex/eval-08-metering` at `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering/DebateAI-V3`
- Commits: first pass `ae14b46f95b8f26349da04c594a7d302021c49cd`; round-1 rework `05f2a584b07921e8f9ed06281225ac8668029e78`
- Push: not performed
- Comments read through: binding `PROG-08-opus-review-1.md` and late-arriving `PROG-08-grok-review-1.md`. The Grok artifact is stale at first-pass tip `ae14b46`, predates round-1 rework, and does not supersede the user-designated Opus input. No board state was mutated, per packet constraint.

## Outcome

- Widened the shared CLI completion seam with observed-only usage.
- Claude and Grok now capture the token/cost values already present in their CLI envelopes.
- Relay HTTP responses emit OpenAI-shaped `usage` with `x_cost_usd`; Codex emits explicit `usage: null` and is never estimated.
- The OpenAI-compatible provider gateway parses optional standard/vLLM usage, tolerates vendor extensions, and persists the exact block (or null) in `raw_artifact.metadata_json` without changing request/choice semantics.
- Added `EvaluatorMeteringRepository.recordCall` to project completed calls into `evaluator.model_call_usage`, enforcing metered/unmetered table invariants.
- Added complete, persisted `relative-external-spend/v1` cells with window bounds, version 1, full-window canonical derivation input, SHA-256 derivation hash, `as_of`, and metered/unmetered counts. Local vLLM external spend is structurally 0; paid remote calls without complete observed USD coverage remain UNKNOWN.
- Relay cost is optional and `modelUsage` values remain permissive. Missing/variant telemetry degrades to partial usage or explicit `usage:null` without refusing startup or completion.
- Gateway usage is parsed independently of the completion schema, so observed usage remains recorded even when choices/content are rejected.

## Changed files

- `acceptance/relay-core.ts`
- `acceptance/claude-relay.ts`
- `acceptance/grok-relay.ts`
- `acceptance/model-shim.ts`
- `acceptance/test-fixtures/fake-claude-cli.mjs`
- `acceptance/test-fixtures/fake-grok-cli.mjs`
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

### Rework round 1

- RED blocker 1: derived cells lacked `windowStart`, `windowEnd`, `derivationVersion`, `derivationInput`, `derivationHash`, and `asOf`; the real-database test failed because `recordRelativeCostCells` did not exist.
- GREEN blocker 1: `deriveRelativeCostCellsV1` now supplies every required field and `EvaluatorMeteringRepository.recordRelativeCostCells` writes every NOT NULL column. The PostgreSQL test strictly reads the complete versioned row back from `evaluator.relative_cost_cell`.
- RED blocker 2: startup under a cost-absent Claude or Grok envelope failed with `CLAUDE_CLI_OUTPUT_INVALID` / `GROK_CLI_OUTPUT_INVALID`.
- GREEN blocker 2: both relays start and serve when cost is absent; observed tokens remain partial usage, and absent cost plus non-object `modelUsage` yields explicit `usage:null` rather than refusal.
- Mean-spend denominator: paid normalization divides by all metered calls only when every metered call has observed USD. Any missing paid amount makes the cell UNKNOWN, so no missing amount is imputed as zero.

## Verification

- `pnpm test` → 83 files passed, 601 tests passed.
- `pnpm exec vitest run --config acceptance/vitest.config.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts acceptance/model-shim.test.ts` → 3 files passed, 22 tests passed.
- `pnpm exec vitest run tests/unit/provider.test.ts tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-database.test.ts` → 3 files passed, 24 tests passed.
- `pnpm typecheck` → pass.
- `pnpm run audit:architecture` → 27 edge rows checked, zero violations.
- `pnpm run audit:source` → zero blocking findings.
- `pnpm run audit:orphans` → pass; no new blocking entry.
- `git diff --check` → pass.
- From harness worktree root: `bash tests/render-templates.sh && bash tests/lint-templates.sh` → pass; templates rendered successfully and lint exited 0.
- Final `git status --short --branch` → clean on `codex/eval-08-metering`.

## Risks / review focus

- Usage is intentionally partial when a CLI reports only one token component; absent fields are omitted and never inferred. `total_tokens` is emitted only when both observed input and output counts exist, using their exact sum.
- Projection is exposed through the evaluator repository boundary; callers must classify runtime as `PAID_REMOTE` or `LOCAL_VLLM` explicitly rather than guessing from token volume.
- `RawArtifactInput.metadata` remains intentionally widened from scalar-only values to `unknown` values because the existing `jsonb` carrier now stores the nested observed usage block; typecheck and provider tests cover the shared-contract change.
- `raw_usage` stores the normalized observed relay/gateway usage block (including an exact derived `total_tokens` only when both observed components exist), not an untouched vendor envelope; the original bytes remain in `ledger.raw_artifact.raw_text`.
- No currency/billing UI or manual price table was introduced.

## Continuation verification after known CLI hang — 2026-08-15

- Recovered the same clean worktree at commit `05f2a584b07921e8f9ed06281225ac8668029e78`; no uncommitted files required a follow-up commit.
- Focused provider/evaluator/real-PostgreSQL command → 3 files passed, 24 tests passed.
- Claude/Grok/Codex relay acceptance command → 3 files passed, 22 tests passed.
- Repository `pnpm typecheck` → pass with no diagnostics.
- `git diff --check` → pass; final Git branch remains `codex/eval-08-metering` and is clean.
- The handoff marker below uses the exact continuation-provided lane string.

READY FOR PEER REVIEW: codex/eval-eval-08-metering
