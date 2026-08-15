# PROG-08 Hermes stage verdict — `eval-08-metering`

Mission: `model-evaluator`  
Lane: `codex/eval-08-metering`  
Verified head: `05f2a58` on `ae14b46`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read every `PROG-08-*.md` artifact present before this verdict. The binding round-1 Claude Opus review returned REWORK because the first pass did not persist `relative_cost_cell` and had tightened relay-envelope parsing in a way that could refuse startup. Commit `05f2a58` addressed both blockers. The same original reviewer then returned PASS, and a fresh second-seat Claude Opus reviewer independently returned PASS under V's Grok-outage ruling in `00-intake-H0.md`. The Grok artifact reviewed the stale first-pass tip and does not replace the binding round-1/rework chain.

## Independent verification

All commands ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Focused relay acceptance | `pnpm exec vitest run --config acceptance/vitest.config.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts acceptance/model-shim.test.ts` | PASS; 3 files, 22 tests, 0 failures |
| Focused unit + DB integration | `pnpm exec vitest run tests/unit/evaluator-foundation.test.ts tests/unit/provider.test.ts tests/integration/evaluator-database.test.ts` | PASS; 3 files, 24 tests, 0 failures |
| Architecture audit | `pnpm run audit:architecture` | PASS; 27 edge rows, no violations |
| Source audit | `pnpm run audit:source` | PASS; no blocking findings |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |

## Blocker verification

### Cost-absent envelopes degrade honestly

Both Claude and Grok envelope schemas now make `total_cost_usd` optional and keep `modelUsage` values permissive. The focused acceptance run exercised the degraded envelope during startup and completion:

- cost absent with observed tokens: relay remains available, preserves only the observed token fields, and does not invent `x_cost_usd`;
- cost absent with unusable/non-object token telemetry: relay remains available and emits `usage: null`, the explicit unmetered surface;
- no absent value is converted to zero or estimated.

### `relative_cost_cell` takes real writes

The focused integration test migrated a real embedded PostgreSQL instance, called the shipped `deriveRelativeCostCellsV1` and `EvaluatorMeteringRepository.recordRelativeCostCells` paths, inserted a complete row into `evaluator.relative_cost_cell`, and strictly read back provider/model/window, relative cost, comparability, metered/unmetered counts, source totals, normalization basis, derivation version/input/hash, and `as_of`. This is a real database write through all table CHECK constraints, not an in-memory fixture.

The unit run also confirmed that a paid model group stays `UNKNOWN` when any metered call lacks observed vendor cost, while local vLLM external spend remains structural zero and its token utilization is retained.

## Lane-state and scope checks

- Branch/head are exactly `codex/eval-08-metering` at `05f2a58`; both declared commits are ancestors of the tested head.
- Final lane `git status --porcelain` was empty.
- An added-line exact-state scan over `git diff dev...HEAD` found no `BOUND` state; no live selector, seat-share, or dispatch binding was introduced.
- The same changed-line scan found no API-key, bearer, authorization, password, or secret material; DR-179 remains satisfied.
- The 15 changed paths are limited to the shared relay/provider usage seam, evaluator metering implementation, fixtures, and focused tests. No migration, UI, currency/billing, or live routing call site changed.

## Carry-forwards

1. The production projection caller is explicitly handed to `eval-05-harvest`: project persisted `metadata_json.usage` plus ledger identity into `ModelCallUsageInput`, classify `PAID_REMOTE` versus `LOCAL_VLLM`, and settle idempotent reprocessing before lane 05 closes.
2. Architecture §3.6 needs one documentation line recording the shipped stricter rule: a paid group is `UNKNOWN` unless every metered call in that group carries an observed vendor amount. Missing cost is never imputed as zero.

These are downstream composition/documentation obligations and do not block the delivered tier-1B repository and normalization surface.

## Decision

Both round-1 blockers are resolved, the binding round-2 review is dual PASS, cost-absent envelope variants degrade without relay refusal or fabricated telemetry, `relative_cost_cell` accepts and returns a complete real PostgreSQL write, and independent typecheck, focused/integration tests, audits, hygiene, state, and DR-179 checks all pass. Under board custody, `eval-08-metering` is done. Per the dependency map this does not unblock lane 05; `eval-05-harvest` remains blocked on `eval-04-tagger`.

HERMES STAGE VERDICT: LANE eval-08 APPROVED
