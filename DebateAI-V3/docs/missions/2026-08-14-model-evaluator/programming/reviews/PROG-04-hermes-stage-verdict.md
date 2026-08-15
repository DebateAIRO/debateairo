# PROG-04 Hermes stage verdict — `eval-04-tagger`

Mission: `model-evaluator`  
Lane: `codex/eval-04-tagger`  
Verified head: `670ac9a` on `c15690f` over `dev`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read every pre-existing `PROG-04-*.md` review artifact. Round 1 split: reviewer A correctly returned REWORK because evaluator calls shared the product run's model-attempt scope, while reviewer B returned PASS with the same coupling reproduced and carried as F-1. Commit `670ac9a` moved evaluator tag calls to null run scope and fresh attempt subjects. Both reviewers independently returned PASS in round 2 after exercising the real PostgreSQL-backed provider gateway.

I reviewed the complete `dev...HEAD` diff and traced the tagger, gateway attempt accounting, budget counter, liveness scan, and serve digest rather than relying only on reviewer summaries.

## Independent verification

All commands ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Focused tagger/database tests | `pnpm exec vitest run tests/unit/evaluator-tagger.test.ts tests/integration/evaluator-database.test.ts` | PASS; 2 files, 27 tests |
| Full repository suite | `pnpm test` | PASS; 85 files, 628 tests |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Worktree state | `git status --short --branch` | clean on `codex/eval-04-tagger` |

The four required decoupling proofs are real and mechanism-sensitive:

1. **Envelope-ceiling tag + serve:** the test pins a product run at `maxModelAttempts=1`, inserts its one product `MODEL_CALL`, then tags through the real `createPostgresProviderGateway`. Tagging succeeds, `BudgetRepository.countRunModelAttempts(runId)` remains 1, and the already-served answer's digest remains readable. This exercises both the product ceiling and serve reader; it would fail under `c15690f`.
2. **Reconciliation:** the ask-time pass receives a real HTTP 503 through the PostgreSQL-backed gateway, which persists a failed evaluator attempt, then reconciliation succeeds. The mechanism is real: `packages/evaluator/src/index.ts:952-955` supplies `runId: null` and a fresh attempt subject; `packages/ledger/src/index.ts:517-530` returns zero cross-invocation consumption for null-run calls, while the product gateway only invokes the product envelope guard for non-null run ids at `apps/runner/src/index.ts:2008-2019`.
3. **Zero liveness triggers:** two real evaluator gateway calls with different model versions persist both artifact and ledger `run_id` as NULL, then the test invokes `detectProviderModelVersionTriggers()` and observes zero product triggers. The production scan admits only `run_id IS NOT NULL` artifacts at `packages/liveness/src/index.ts:309-318`.
4. **Byte-identical digest:** the test snapshots `JSON.stringify(readExecutionLedgerDigest(...))` before and after a real tag and compares exact bytes. The serve reader selects ledger entries only by product `run_id` at `packages/serve/src/index.ts:1511-1525`, so null-run evaluator evidence cannot enter the digest.

The original lane gates also remain green: container success/down/refusal and timeout are typed and non-gating; memory is byte-identical before/after tagging; FR-0.6 AC5 remains green; isolation is asserted before the observed provider call; no `BOUND` state or DR-179 credential path was introduced.

## Ratification rulings

### 1. Migration 0025 REFUSED-only nonblank relaxation — RATIFIED

I ratify `migrations/0025_evaluator_domain_refusal_receipts.sql` as the architecture correction for refusal evidence. It permits blank `proposed_name` and `normalized_name` only when `decision='REFUSED'`; every admitted, matched, near-duplicate, and invalid proposal retains the Architecture §3.2 nonblank invariant. The migration is replay-safe and the integration test reads back the exact whitespace proposal, empty normalized value, typed `REFUSED` decision, and `EVALUATOR_DOMAIN_PROPOSAL_BLANK` reason.

A sentinel label would manufacture proposal content where none exists and weaken audit truth. The scoped DDL relaxation is therefore preferable and accepted as superseding Architecture §3.2's unconditional nonblank sketch for REFUSED receipts only.

### 2. Null-run-scoped tagger evidence — RATIFIED

I ratify the divergence from Architecture §2/§3.2's implied product-run-scoped provider evidence. Null `run_id` is the correct structural isolation mechanism: it removes evaluator attempts from every product per-run reader by construction instead of requiring each budget, liveness, serve, graph, battery, and future reader to remember an evaluator exception.

Correlation is intentionally evaluator-owned: `domain_admission.run_id`, `question_domain.run_id`, `pipeline_event.run_id`, and their raw-artifact references retain the product association and provenance. The provider gateway still writes ordinary append-only ledger/raw-artifact evidence, but that evidence belongs to evaluator attempt scope rather than the product run scope. This architecture note supersedes the prior implication that tagger raw evidence itself must carry the product `run_id`.

Cross-invocation evaluator attempt accounting is consequently off by design; lane 06 must bound reconciliation scheduling/retries independently.

### 3. Additive provider vocabulary — ACCEPTED

I accept the additive `packages/providers` edit adding `CLASSIFIER` and `evaluator`. The values label the tag call honestly, are compile-time vocabulary only, have no runtime consumer or migration constraint, and generated-contract checks were clean in both round-2 reviews. Reusing `JUDGE` / `critic-exempt` would be semantically false; removal is not ordered.

## Downstream handoffs

These are binding board comments:

- **Lane 05 / harvest:** exclude the `evaluator.` call-site prefix from author/reviewer populations; treat `evaluator.question_domain` as authoritative over `pipeline_event` when deciding whether a run is tagged; own the production caller for metering projection (`recordCall` / `deriveRelativeCostCellsV1`).
- **Lane 06 / add-on/orchestration:** bound reconciliation retries, because null-run isolation deliberately disables cross-invocation evaluator attempt accounting.
- **Composition root / final wiring (F-3):** source the configured provider/maker isolation set from the register before bind; do not accept a vacuous or caller-invented `deployment.configuredProviders` set as the structural isolation proof.

## Decision

The round-1 product-run coupling is closed by construction, both round-2 seats passed, independent typecheck and all 628 repository tests passed, and all three escalated architecture decisions are ratified or accepted as above. Under board custody, `eval-04-tagger` is done and `eval-05-harvest` is ready with the recorded handoffs. Merge/integration routing remains an orchestrator act.

HERMES STAGE VERDICT: LANE eval-04 APPROVED
