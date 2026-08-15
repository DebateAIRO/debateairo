# Codex PROG-05 — eval-05-harvest

## Result

Implemented the tier-3 terminal harvest lane on branch
`codex/eval-05-harvest` in
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest`.
The worker now reconciles terminal runs into deterministic, append-only
`evaluator.observation` rows and projects persisted call usage plus versioned
relative-cost cells without adding a provider/model call.

Local lane commit: `50b1a178a8e54c5c1f2784658b87654fa9828efd`.

## Four mandatory handoffs

1. `evaluator.` call sites are excluded from performance observations. The
   projector classifies the artifact through
   `ledger.ledger_entry.attempt_id = ledger.raw_artifact.attempt_id`, so the
   exclusion also covers evaluator artifacts whose `run_id` is null.
2. Domain is read directly from the singular
   `evaluator.question_domain` row. No pipeline-event success receipt is used as
   domain authority; a missing link persists observation rows with
   `domain_id = NULL`.
3. `EvaluatorMeteringRepository.recordCall`,
   `deriveRelativeCostCellsV1`, and `recordRelativeCostCells` are composed from
   `apps/evaluator-worker`. Observed usage comes from persisted raw-artifact
   metadata. The product provider gateway remains unchanged and performs no
   evaluator writes.
4. Evaluator-artifact correlation is by attempt id, never by product run id.
   The PostgreSQL test uses a null-run evaluator artifact to prove the path.

## Delivered behavior

- Terminal eligibility comes from a durable `core.run_progress_event` with
  `kind='TERMINAL'`.
- Authored nodes and node strengths project to `AUTHORING`; reduced judgements
  to `JUDGING`; cross-maker reviews to `REVIEWING`; accepted real-world outcomes
  to settlement-fed `AUTHORING` rows.
- Consensus and settlement basis are explicit in evaluator-owned rows. Harvest
  never inserts into or mutates `scorecard.answer_outcome`, preserving Q59.
- Exact provider/model/version identity is retained. Artifacts with absent model
  version are skipped instead of merged at maker level.
- A run advisory lock, versioned successful HARVEST receipt, observation natural
  key, and idempotent metering/cost persistence prevent duplicates on replay.
- Batch and single-run worker entry points are available. Neither accepts or
  invokes a `ProviderGateway`.

## Files changed in the lane

- `DebateAI-V3/packages/evaluator/src/index.ts`
- `DebateAI-V3/apps/evaluator-worker/src/index.ts`
- `DebateAI-V3/packages/evaluator/README.md`
- `DebateAI-V3/tests/unit/evaluator-harvest.test.ts`
- `DebateAI-V3/tests/integration/evaluator-database.test.ts`

## RED → GREEN evidence

- RED tooling: the first focused test command failed because the worktree had no
  installed `vitest`; `pnpm install --frozen-lockfile` restored the exact locked
  workspace dependencies.
- RED behavioral fixture 1: the PostgreSQL harvest test failed with
  `root node structure is inconsistent`; the fixture was corrected to preserve
  the graph's single-root law.
- RED behavioral fixture 2: the child then failed `node_structure_shape`; its
  required positive sibling ordinal/materialized path was corrected.
- GREEN: the focused PostgreSQL test then passed and the full evaluator database
  suite passed 20/20.

## Verification

- `pnpm exec vitest run tests/unit/evaluator-foundation.test.ts tests/unit/evaluator-domains.test.ts tests/unit/evaluator-tagger.test.ts tests/unit/evaluator-harvest.test.ts`
  — 4 files, 28 tests passed.
- `pnpm exec vitest run tests/integration/evaluator-database.test.ts`
  — 1 file, 20 tests passed, including nullable-domain, evaluator exclusion,
  worker metering, idempotency, Q59 separation, and FR-0.6 AC5 differential.
- `pnpm lint` — architecture audit checked 27 edge rows with no violations;
  source audit reported no blockers.
- `pnpm generate:contract && pnpm typecheck` — passed.
- `pnpm test` — full repository suite passed (exit 0).
- `bash tests/render-templates.sh && bash tests/lint-templates.sh` from the outer
  harness — passed.
- `git diff --check` — passed.

## Scope and safety

- No provider call added.
- No API key or secret added.
- No `BOUND` state added.
- No product dispatch, routing, gateway, settlement, or non-evaluator behavior
  changed.
- No board mutation and no push performed.
- Mission comments cursor: not ticketed in this offline goal packet.

READY FOR PEER REVIEW

## Rework round 1

Peer-review rework is implemented in local commit
`720303d` (`fix(evaluator): reconcile late settlements safely`), on top of the
original lane commit `50b1a17`. Nothing was pushed and no board state was
mutated.

### Blockers closed

1. Late accepted settlements now cause the batch worker to revisit an already
   harvested terminal run. Consensus node-strength and settlement observations
   share `prowess.outcome.v1`; the settlement row sets
   `supersedes_observation_id` to the matching append-only consensus row. The
   pass remains idempotent and returns `SETTLEMENTS_RECONCILED` only when it
   inserts new settlement evidence.
2. Empty, unknown-key-only, and internally inconsistent observed usage now
   produce typed `UNMETERED` `model_call_usage` rows. Reconciliation isolates
   each pending row, and both worker entry points treat a whole metering failure
   as non-blocking for harvest.
3. The zero-provider-call gate now snapshots both `ledger.raw_artifact` count
   and `ledger.ledger_entry` MODEL_CALL count. The test first injects provider
   evidence and proves the assertion rejects, then proves real harvest leaves
   both counts unchanged.
4. Version-less referenced artifacts emit a SKIPPED
   `MODEL_IDENTITY_INCOMPLETE:<raw_artifact_id>` pipeline receipt. STARTED is
   committed before observation writes; a failed observation transaction emits
   a separately committed FAILED/`TERMINAL_HARVEST_FAILED` receipt.

### Reproduce-first evidence

Before the fixes, the new embedded-PostgreSQL regressions demonstrated:

- late re-harvest returned `ALREADY_HARVESTED` and projected no settlement;
- a total-token mismatch threw `MODEL_CALL_USAGE_TOTAL_MISMATCH` before an
  unrelated run could harvest;
- a version-less source left no identity-incomplete receipt;
- a forced observation-trigger failure rolled back all receipts.

The provider-evidence sentinel was separately proven non-vacuous by deliberately
inserting a raw artifact plus MODEL_CALL row and observing the assertion reject.
After implementation, all five rework tests pass.

### Quick non-blockers addressed

- Terminal batch selection defaults to a 100-run cap.
- Metering handles both the ledger-entry and raw-artifact uniqueness constraints
  and cannot dereference a missing conflict fallback row.
- The local-vLLM runtime-class assumption is documented at the classification
  point.
- Relative-cost first-write-per-window semantics are documented.

Deferred for their owning/follow-on lanes: hardening evaluator exclusion beyond
the mandatory attempt-id/call-site evidence; bounding the still-global metering
scan; defining an unknown-identity cost bucket; register-governing harvest
metric literals; reading `serve.answer` where a later consumer needs it; and a
dedicated crash-simulation test of the observation natural key (the settlement
reconciliation and existing receipt replay tests cover production idempotency).

### Rework verification

- Focused evaluator unit + embedded-PostgreSQL suites: 3 files / 30 tests passed.
- `pnpm test`: full repository suite passed (exit 0).
- `pnpm run lint`: 27 architecture edges, zero violations; source audit zero
  blockers.
- `pnpm run generate:contract && pnpm run typecheck`: passed.
- Outer `bash tests/render-templates.sh && bash tests/lint-templates.sh`: passed.
- `git diff --check`: passed.

READY FOR PEER REVIEW

## Continuation verification after client restart

The prior client termination left the lane safe and complete: branch
`codex/eval-05-harvest` is clean at `720303d7f8ef9d939d19dd06fa22016ebc4d9d92`.
No additional code or commit was required.

- `pnpm exec vitest run tests/unit/evaluator-harvest.test.ts tests/integration/evaluator-harvest-rework.test.ts tests/integration/evaluator-database.test.ts`
  — 3 files / 30 tests passed, including all five four-blocker rework
  regressions on embedded PostgreSQL.
- `pnpm run typecheck` — passed (`tsc --noEmit`, exit 0).

READY FOR PEER REVIEW

## Rework round 2

Round-2 time-safety and batch-isolation rework is implemented in local commit
`8764ac6` (`fix(evaluator): make settlement harvest time-safe`), on top of
`720303d`. Nothing was pushed and no board state was mutated.

### Root cause closed

- Settlement observations now use an order-safe harvest clock, bounded below by
  the prior consensus observation clock. The resolver's true `resolved_at`
  remains in outcome/provenance JSON and therefore in the derivation input hash.
- A backdated settlement arriving after harvest supersedes its consensus row
  without violating the append-only trigger. A backdated settlement already
  present before first harvest also succeeds and preserves the ordinary
  consensus plus settlement projection.
- Supersession is revalidated at write time. If ordering cannot be made valid,
  the link is omitted with typed `SUPERSESSION_ORDER_INVALID` evidence instead
  of aborting harvest. If a prior was already consumed by another settlement,
  the later settlement stays auditable with a null link and a typed
  `SUPERSESSION_PRIOR_UNAVAILABLE` receipt.
- Terminal batch reconciliation isolates every run with `try/catch`, returns a
  typed FAILED result while the repository durably records the FAILED receipt,
  continues to later healthy runs, and stops reselecting a run after three
  consecutive failed harvest attempts.

### Reproduce-first evidence

With pinned settlement and harvest clocks, the three new embedded-PostgreSQL
regressions were RED against the prior implementation:

- backdated late settlement threw `OBSERVATION_SUPERSESSION_INVALID`;
- backdated pre-existing settlement threw the same error and left zero
  observations;
- a trigger-poisoned first run rejected the whole batch before a later healthy
  run could harvest.

The corrected fixtures pin both sides of the clock and all three are now GREEN.

### Quick non-blockers addressed

- STARTED and terminal receipts use the same frozen snapshot and hash.
- Multiple accepted settlements consume a matching consensus row at most once;
  later settlement rows have null `supersedes_observation_id` plus a typed
  receipt.
- Best-effort outer metering failure reports
  `METERING_RECONCILIATION_FAILED` with `callsFailed: 0` rather than fabricating
  a failed-call count.
- Ticket 07 guidance now explicitly says superseded consensus rows are replaced,
  not pooled or averaged with settlement rows.

### Rework verification

- `pnpm exec vitest run tests/integration/evaluator-harvest-rework.test.ts tests/integration/evaluator-database.test.ts tests/unit/evaluator-harvest.test.ts`
  — 3 files / 35 tests passed on embedded PostgreSQL.
- `pnpm run typecheck` — passed (`tsc --noEmit`).
- `pnpm run lint` — 27 architecture edges, zero violations; source audit zero
  blockers.
- Outer `bash tests/render-templates.sh && bash tests/lint-templates.sh` — passed.
- `git diff --check` — passed.

READY FOR PEER REVIEW

## Rework round 3 — Hermes stage verdict

The Hermes circuit-breaker correction is implemented in local commit `1859b75`
(`fix(evaluator): bound prepare-phase harvest failures`), on top of `8764ac6`.
Nothing was pushed and no board state was mutated.

### Blocker closed

`EvaluatorHarvestRepository.harvestTerminalRun` now places validation, snapshot
reads, projection/hash computation, STARTED persistence, and phase-2 writes under
one failure boundary. A phase-1 exception therefore receives the same durable
FAILED/`TERMINAL_HARVEST_FAILED` receipt counted by the existing three-strike
selector. When projection reached the frozen snapshot hash, that hash is reused;
an earlier prepare failure uses a deterministic run/time/phase hash. Receipt
persistence remains best-effort only when the database itself cannot accept the
receipt.

### Reproduce-first evidence

The new embedded-PostgreSQL regression poisons only the phase-1 STARTED insert
for the lexically first terminal run and leaves a healthy later run untouched.
Before the fix, the fourth batch still selected the poison run and the test
failed at `expected true to be false`; PostgreSQL logged four
`PROG05_PREPARE_POISON` attempts and no countable strikes. After the fix, the
healthy run harvests in the first batch, exactly three FAILED receipts persist
for the poison run, and the fourth batch excludes it.

### Verification

- `pnpm exec vitest run tests/integration/evaluator-harvest-rework.test.ts tests/integration/evaluator-database.test.ts tests/unit/evaluator-harvest.test.ts`
  — 3 files / 36 tests passed on embedded PostgreSQL.
- `pnpm run typecheck` — passed (`tsc --noEmit`).
- `git diff --check` — passed.
- Scope: only `packages/evaluator/src/index.ts` and
  `tests/integration/evaluator-harvest-rework.test.ts` changed.

READY FOR PEER REVIEW
