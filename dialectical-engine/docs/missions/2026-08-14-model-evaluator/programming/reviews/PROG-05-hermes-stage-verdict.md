# PROG-05 Hermes stage verdict — `eval-05-harvest`

Mission: `model-evaluator`  
Lane: `codex/eval-05-harvest`  
Verified head: `1859b75` on `8764ac6` / `720303d` / `50b1a17` over `dev`  
Verdict: **APPROVED (RE-VERDICT)**

## Review chain and ruling basis

I read all six pre-existing `PROG-05-*.md` review artifacts. Round 1 was dual REWORK on metering poison/isolation, the zero-provider-call proof, late-settlement supersession, and receipt coverage. Round 2 was dual REWORK because supersession depended on wall-clock luck and one poisoned run could abort the batch. Round 3 was dual PASS after commit `8764ac6` added max-clock ordering, live-prior re-checking, per-run batch isolation, and a three-FAILED-receipt selector bound.

The round-3 fixes close the supersession and provider-call gates, but independent stage inspection found the advertised circuit breaker does not cover every failure that the batch reports as `FAILED`.

## Independent verification

All commands ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository suite | `pnpm test` | PASS; 87 files / 644 tests, exit 0 |
| Branch state | `git status --short --branch` | clean lane at `8764ac6` before board/report writes |

## Required spot-checks

### Supersession time-safety — PASS

The projector computes settlement `observed_at` as `max(snapshot.observedAt, prior.observedAt)` at `packages/evaluator/src/index.ts:1230-1233`, while preserving the resolver's true `resolved_at` in both outcome and provenance JSON at `:1234-1257`. Inside the observation-write transaction, the repository re-reads whether the named prior is still unsuperseded at `:1349-1363`, falls back to a live matching prior at `:1365-1380`, and recomputes the max-clock against that live row at `:1399-1413`. This satisfies the trigger's ordering law without erasing resolver time.

### Zero-provider-call ledger-count gate — PASS

`tests/integration/evaluator-harvest-rework.test.ts:171-183` snapshots total `ledger.raw_artifact` rows and `MODEL_CALL` ledger rows before and after the action. The test at `:360-372` includes a negative control that injects provider evidence and fails the helper, then runs the real worker harvest path and proves both counts remain unchanged. This is a mechanism-sensitive proof, not only a type-signature argument.

### Batch isolation and three-strike parking — REWORK

Per-run isolation exists: `apps/evaluator-worker/src/index.ts:142-151` catches each repository failure, appends a typed `FAILED` result, and continues the loop. Parking, however, counts only persisted HARVEST `FAILED` receipts at `:122-136`.

`EvaluatorHarvestRepository.harvestTerminalRun` performs the entire prepare transaction before entering its failure handler: snapshot reads, projection/hash computation, and the durable STARTED insert are at `packages/evaluator/src/index.ts:1296-1307`; the `try` starts only at `:1310`. The catch that persists `TERMINAL_HARVEST_FAILED` is limited to phase 2 at `:1464-1474`. Therefore a per-run failure during phase 1 is returned by the batch as `FAILED` on every invocation but adds no counted FAILED receipt. The selector never reaches three strikes and never parks that run.

The existing poison regression at `tests/integration/evaluator-harvest-rework.test.ts:396-447` raises from an observation INSERT in phase 2, so its exact-three-receipt assertion does not cover this gap.

This contradicts the claimed batch circuit breaker: the worker has two definitions of failure — caught batch failures and receipt-counted phase-2 failures — but only the latter participates in retry bounding. The fix must ensure every per-run failure caught by the batch is either represented by a durable strike or otherwise bounded, with a regression that forces a phase-1 failure and proves the run parks after exactly three attempts while a healthy run remains isolated.

## Board custody and downstream handoffs

The durable `model-evaluator` Kanban board (with matching wayfinder notes) now
records the required downstream obligations:

- ticket 07 must REPLACE the consensus row named by `supersedes_observation_id`, never pool or average it with the settlement row, and treat the superseded row as replaced while retaining append-only audit history;
- ticket 11 must expose circuit-broken/parked runs; no automatic reset path exists by design today;
- ticket 06 / lane `eval-06-addon` must bound reconciliation retries independently because cross-invocation evaluator attempt accounting is off by design under the PROG-04 null-run ruling;
- ticket 05 records that `serve.answer` remains unread and is explicitly deferred under Architecture §5.2.

Because this verdict is REWORK, board custody moved `eval-05-harvest`
(`t_37e994c0`) from ready to blocked with `HERMES STAGE REVIEW CHANGES
REQUESTED`; it does **not** mark the lane done and does **not** set
`eval-06-addon` (`t_2041f591`) ready. Ticket 05 remains open and ticket 06
remains blocked by 05 until the phase-1 strike gap is closed and re-verified.

## Decision

The typecheck and all 644 tests pass; supersession is time-safe by max-clock plus in-transaction re-check; and the zero-provider-call count gate is real. Approval is nevertheless withheld because the three-strike parking rule excludes failures thrown before phase 2 even though the batch reports those attempts as failed. The circuit breaker is not yet complete for the repository call it wraps.

HERMES STAGE VERDICT: LANE eval-05 REWORK

## Re-verdict — commit `1859b75`

I read both independent round-4 reviews (`PROG-05-opus-review-4.md` and
`PROG-05-opus2-review-4.md`), inspected the narrow two-file delta, and re-ran
the required checks from the lane worktree.

Commit `1859b75` closes the phase-1 strike gap. Validation, the prepare
transaction, and the observation-write transaction now share the one outer
`try`; its catch persists `FAILED / TERMINAL_HARVEST_FAILED`. If failure occurs
before `harvestInputHash` exists, the receipt receives a deterministic SHA-256
over the run id, valid observed clock (or null), and `failure_phase: PREPARE`.
Thus the batch result and the selector's persisted strike counter now describe
the same repository-call failure boundary.

My independent real-PostgreSQL probe used a reason-keyed trigger
(`NEW.reason = 'TERMINAL_HARVEST_STARTED'`), rather than the committed test's
state-keyed predicate. The poisoned run sorted before a healthy run. Passes 1,
2, and 3 each returned its typed FAILED result and persisted one durable
TERMINAL_HARVEST_FAILED receipt; pass 1 also returned HARVESTED for the healthy
run and wrote its observation. Pass 4 no longer selected the poison. The final
strike query returned exactly three FAILED receipts and one distinct synthetic
input hash. The one-test probe passed and its scratch file was removed.

Repository gates also pass at `1859b75`: `pnpm run typecheck` exited 0 with no
diagnostics, and `pnpm test` passed 87 files / 645 tests. The increase from 644
is exactly the committed phase-1 parking regression.

Board custody is now satisfied: `eval-05-harvest` is done and
`eval-06-addon` is ready. The lane-06 handoff remains binding: its reconciliation
retries must be independently bounded because cross-invocation evaluator
attempt accounting is off by design under the PROG-04 null-run isolation
ruling; it must not rely on the product run attempt counter.

The prior non-blocking operator note remains: if FAILED-receipt persistence is
itself unavailable, no durable strike can be counted. This does not block the
lane because per-run isolation still protects healthy runs; ticket 11 owns the
parked/stalled operator surface.

HERMES STAGE VERDICT: LANE eval-05 APPROVED
