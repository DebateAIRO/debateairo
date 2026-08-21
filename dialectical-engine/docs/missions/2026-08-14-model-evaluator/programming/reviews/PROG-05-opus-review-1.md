# PROG-05 review 1 — Opus reviewer A — lane `codex/eval-05-harvest`

Mission: model-evaluator (PROGRAMMING loop, tier 3).
Branch reviewed: `codex/eval-05-harvest` @ `50b1a17` (single local commit, not pushed).
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest`.
Diff scope: 5 files, +833/-5 — `packages/evaluator/src/index.ts`,
`apps/evaluator-worker/src/index.ts`, `packages/evaluator/README.md`,
`tests/unit/evaluator-harvest.test.ts`, `tests/integration/evaluator-database.test.ts`.

## Verdict

**REWORK** — two blockers (one confirmed defect that can permanently disable the
lane's own deliverable; one named merge-gate proof that is argued rather than
asserted) plus one unaddressed architecture obligation. Everything else on the
tier-3 row and all four mandatory handoffs are genuinely delivered.

## Verification I ran myself (not the lane's claims)

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | clean (no output) |
| Evaluator unit tests | `npx vitest run tests/unit/evaluator-{harvest,foundation,domains,tagger}.test.ts` | 4 files / 28 tests passed |
| Evaluator DB tests | `npx vitest run tests/integration/evaluator-database.test.ts` | 1 file / 20 tests passed, incl. new harvest test and FR-0.6 AC5 differential |
| Full suite | `npx vitest run` | 86 files / 634 tests passed, exit 0 |
| Audits | `pnpm run lint` | architecture: 27 edge rows, 0 violations; source: no blockers |
| Probe (mine) | `tsx` harness driving `reconcileEvaluatorMetering` with a stub pool | see Blocker 1 |

Test honesty: the lane self-report's numbers reproduce exactly. No skipped,
`.only`, or vacuous assertions found in the added tests; the new integration test
asserts real row contents (`domain_id`, `step`, `model_id`, `truth_basis`), not
just call success.

## Axis 1 — deliverables vs the tier-3 row

Delivered, and it matches Architecture §5.2 / §3.4 / FR-3.0–3.5:

- **Terminal reconciler.** `EvaluatorHarvestRepository.harvestTerminalRun` gates on
  a durable `core.run_progress_event kind='TERMINAL'` (`run_one_terminal_event`
  makes that singular), takes `pg_advisory_xact_lock` per run inside the write
  transaction, and writes STARTED/SUCCEEDED `evaluator.pipeline_event` receipts
  with a content `input_hash`. `reconcileEvaluatorTerminalRuns` is the batch
  selector — "terminal runs with no successful HARVEST receipt at this version",
  exactly Architecture §3.3.
- **Deterministic projector.** `projectEvaluatorObservations` is a pure function
  over a snapshot: no clock, no randomness, stable JSON-key sort, frozen output.
  Unit-tested for equality across two invocations.
- **Rows per (model, domain, step).** AUTHORING from `core.node` +
  `ledger.node_strength_record`; JUDGING from `ledger.reduced_judgement`;
  REVIEWING from `ledger.node_review` (keyed on the *reviewer's* artifact, which
  is the correct identity for a REVIEWING row). Landing is Option E
  (`domain_id` + `step` columns) — FR-3.5 AC2 satisfied.
- **Consensus vs settlement.** `truth_basis` is the evaluator-owned discriminator;
  accepted `scorecard.answer_outcome` rows project SETTLEMENT-fed AUTHORING rows
  and set `answer_outcome_id` (satisfying the table's
  `(truth_basis='SETTLEMENT') = (answer_outcome_id IS NOT NULL)` CHECK). Harvest
  contains no INSERT/UPDATE against `scorecard.*` — grep-verified; the DB test
  asserts the `answer_outcome` count for the run is unchanged. Q59 untouched.
- **FR-0.7 identity granularity.** Artifacts with null/blank `model_version` are
  dropped rather than collapsed to maker level. Correct direction (see Finding 1
  for the missing receipt).
- **Boundary.** Every table the harvest reads (`core.run_progress_event`,
  `core.node`, `ledger.{raw_artifact,ledger_entry,node_review,reduced_judgement,
  node_strength_record,propagation_run}`, `scorecard.answer_outcome`,
  `evaluator.question_domain`) is in the 0023 `debateai_evaluator_worker` SELECT
  grant; every write target is in the worker INSERT grant. Architecture §2.1/§2.2
  hold under the narrow role, not just under the test superuser.

## Axis 2 — the four mandatory handoffs

1. **`evaluator.` call-site exclusion — honored.** The projector builds an excluded
   attempt set from every `ledger.ledger_entry.call_site_key` starting with
   `evaluator.` (correlated by `attempt_id`) and applies it to the artifact set
   before any row is built.
   Covered in both the unit test and the DB test (an evaluator-authored node is
   inserted and provably yields no observation).
2. **`evaluator.question_domain` authoritative — honored.** `readSnapshot` reads
   the singular `question_domain` row directly; no pipeline event is consulted for
   domain. Nullable-domain harvest is tested end-to-end in PostgreSQL (all three
   observation rows land with `domain_id = NULL`) and in the projector unit test.
3. **Metering caller wired worker-side — honored (with Blocker 1).**
   `reconcileEvaluatorMetering` is the first production caller of `recordCall`,
   `deriveRelativeCostCellsV1` and `recordRelativeCostCells`; it is invoked only
   from `apps/evaluator-worker`, reads observed usage out of persisted
   `raw_artifact.metadata_json`, and touches no product gateway code. The DB test
   asserts three `model_call_usage` rows appear from the worker path.
4. **Attempt-id correlation — honored.** `ledger_entry ⋈ raw_artifact` is on
   `attempt_id` in both the harvest snapshot and the metering query; no evaluator
   artifact is joined by `run_id`. The DB fixture deliberately uses a null-`run_id`
   evaluator artifact, so the path is proven rather than asserted.

## Axis 5 — gates, posture, blast radius

FR-0.6 AC5 differential green; full suite green; audits green; typecheck green.
No `BOUND` literal, no API key/authorization header, no register mutation, no
migration added, no product file touched (worker + evaluator package + tests +
README only). Single local commit, no push, no board mutation. DR-179 clean.

---

## Blockers

### B1. Metering reconciliation is a poison pill that permanently blocks harvest

`readObservedUsage` (packages/evaluator/src/index.ts) parses
`metadata_json.usage` with a non-strict `z.object`, so unknown keys are
**stripped**. It returns a *non-null* usage object whenever `usage` is present at
all — including when nothing survives stripping. `recordCall` then runs
`assertObservedUsage`, which throws on exactly those shapes. The throw escapes
`reconcileEvaluatorMetering`, which both worker entry points call **first and
unguarded**, so harvest never runs.

Confirmed empirically (stub pool, real code path):

```
reasoning-style totals (total != prompt+completion): THREW MODEL_CALL_USAGE_TOTAL_MISMATCH
empty usage object:                                  THREW MODEL_CALL_USAGE_EMPTY
unknown-key-only usage (e.g. input_tokens/output_tokens): THREW MODEL_CALL_USAGE_EMPTY
usage null (control):                                reached the DB write path
well-formed usage (control):                         reached the DB write path
```

Why this is a blocker and not a nit:

- The pending-calls query is **global**, not run-scoped
  (`WHERE action_kind='MODEL_CALL' AND outcome='OK' AND … projected IS NULL`), so
  one malformed artifact anywhere in `ledger` blocks harvest for **every** run.
- The failure is **permanent**: the row is never projected, so it stays pending
  and re-throws on every subsequent invocation. No receipt, no skip, no progress.
- It is **reachable from the real gateway**: `OpenAICompatibleProviderGateway`
  persists `metadata.usage` as whatever the endpoint returned (`usageSchema` is
  `.passthrough()`), so relay/CLI-backed endpoints with non-OpenAI usage keys, or
  an empty `usage: {}`, produce exactly the fatal shapes above.
- The DB CHECK on `model_call_usage` already forbids
  `total_tokens <> prompt+completion`, so such a call **can only ever be stored as
  UNMETERED** — throwing is not protecting an invariant, it is refusing to record
  the very posture FR-0.5 prescribes ("observed usage **or** UNMETERED").

Fix: have `readObservedUsage` return `null` when the surviving usage object is
empty or internally inconsistent (i.e. run the `assertObservedUsage` predicate as
a *filter*, not as an exception), and/or isolate per-row failures behind a
FAILED/SKIPPED receipt so one bad call cannot stall the pipeline. Add a test with
`usage: {}` and a `total != prompt + completion` payload proving harvest still
completes and the call lands UNMETERED.

### B2. "Zero-provider-call proof" is argued, not proven

The lane's named merge gate is a *proof*. What exists is a structural argument:
harvest functions take only a `Pool`, and no harvest code references
`ProviderGateway`. True — I verified it — but nothing in the test suite would fail
if a future edit introduced a call. The DB test runs the whole path with no
gateway and does not assert the absence of provider evidence.

Fix (cheap, in the existing test): snapshot `count(*)` of
`ledger.raw_artifact` and `ledger.ledger_entry` before and after
`runEvaluatorTerminalHarvest` and assert both are unchanged — harvest cannot make
a provider call without leaving artifact/ledger evidence, so this is a real
proof rather than a restatement of the type signature.

### B3. Late-arriving settlements are structurally unharvestable; supersession unimplemented

Architecture §5.2 is explicit: "If an external settlement arrives later, a new
settlement-fed observation supersedes the earlier consensus observation", and
§3.4 ships `supersedes_observation_id` plus
`evaluator.validate_observation_supersession()` for precisely this.

As built, the settlement branch reads accepted `answer_outcome` rows **only at
harvest time**, and the successful HARVEST receipt at
`pipeline_version = 1` permanently excludes the run from
`reconcileEvaluatorTerminalRuns` and short-circuits `harvestTerminalRun` with
`ALREADY_HARVESTED`. External settlement almost always postdates terminality, so
in production the settlement-fed branch is effectively unreachable and
`supersedes_observation_id` is never written. The projector's settlement code and
the unit test that covers it therefore test a path that real data will not take.

Fix: either add the settlement re-visit pass (a settlement-scoped reconciler that
inserts the superseding row through the existing trigger), or record an explicit,
written deferral naming the owning ticket (06/07) plus the receipt that will mark
such runs — silence here reads as an unnoticed gap rather than a decision.

## Findings (non-blocking, but please address or document)

1. **Missing `MODEL_IDENTITY_INCOMPLETE` receipt.** Architecture §3.4: an artifact
   without trustworthy model version "is skipped with a pipeline receipt such as
   `MODEL_IDENTITY_INCOMPLETE`; it is not silently merged." The projector skips
   silently (README documents it; the DB does not). A SKIPPED
   `evaluator.pipeline_event` is permitted by `evaluator_pipeline_one_success`
   (partial index on SUCCEEDED only), so this is implementable as-is.
2. **Relative-cost cells freeze on first derivation per window.** The new
   `ON CONFLICT (provider, model_id, model_version, window_start, window_end,
   derivation_version) DO NOTHING` means the first reconciliation in a window wins
   and every later one silently discards a fresher derivation (`as_of` is not in
   the key). Previously this raised loudly. Since the worker calls
   `reconcileEvaluatorMetering` on *every* terminal run, cost cells will reflect
   only the first run of each window. Document the semantics or key on `as_of`.
3. **Unbounded reconciler.** `reconcileEvaluatorTerminalRuns` selects *all*
   terminal runs ever recorded with no lookback or batch limit — its first
   production invocation backfills the entire history (all with `domain_id NULL`).
   `runEvaluatorTerminalHarvest` additionally re-scans every unprojected call in
   `ledger` per single run. Bound it before it is scheduled.
4. **Second unique constraint unhandled in the metering insert.**
   `model_call_usage.raw_artifact_id` is `UNIQUE`, but the insert's conflict target
   is `(ledger_entry_id)` only. Two `MODEL_CALL` entries sharing one attempt's
   artifact raise an unhandled unique violation into the same fatal path as B1.
5. **`runtimeClass` is a binary provider_ref test.** Anything that is not
   `provider:evaluator-vllm` is classified `PAID_REMOTE`. Harmless today
   (comparability degrades to UNKNOWN without observed `x_cost_usd`), but it is a
   cost claim about product providers made by omission; worth a comment.
6. **Idempotency coverage stops at the receipt.** The re-harvest test exercises the
   `ALREADY_HARVESTED` short-circuit only; the observation natural-key
   `ON CONFLICT DO NOTHING` — the second and more interesting line of defence — is
   never executed by any test.
7. **`serve.answer` unread.** Architecture §5.2 lists it among harvest inputs. No
   observable consequence for the rows produced; noted for completeness.

## What I explicitly checked and found clean

- No `scorecard.*` write anywhere in the lane; Q59 CHECK and settlement code path
  untouched (FR-3.2 AC3/AC4).
- Observation natural key
  `UNIQUE NULLS NOT DISTINCT (run_id, provider, model_id, model_version, domain_id,
  step, metric, source_kind, source_ref, derivation_version)` exists in 0023, so the
  untargeted `ON CONFLICT DO NOTHING` is backed by a real constraint.
- Advisory lock + receipt + natural key are taken inside one write transaction —
  concurrent harvests of one run serialize correctly.
- Projector output is frozen and sorted; `observedAt` is defensively copied.
- No product behavior change: `git diff --stat` touches only evaluator worker,
  evaluator package, its README, and two test files.

## Recommended rework scope

B1 (a few lines plus a test), B2 (three assertions in the existing DB test), and
B3 (either the pass or a written deferral). Findings 1 and 4 are small enough to
fold in. Nothing in the lane's structure needs rethinking — the reconciler,
projector, receipts, and all four handoffs are sound.

---

Reviewer: Opus reviewer A. Read-only outside this file and my self-report; no
commits, no board mutation.
