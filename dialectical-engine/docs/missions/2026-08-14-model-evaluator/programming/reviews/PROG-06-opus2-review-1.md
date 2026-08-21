# PROG-06 peer review — opus2 (second independent reviewer), round 1

Seat: Opus2, substituting the Grok reviewer seat for PROG-06 per V's ruling.
Date: 2026-08-15.
Target: `codex/eval-06-addon` @ `ebdff73` "feat(evaluator): grade judge outputs blindly"
(`git diff dev...codex/eval-06-addon`, 6 files, +1070/-0).
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`.
Judgment formed from scratch; no other PROG-06 review read.

## Verdict: PASS

Every merge-gate item is verified by my own mechanisms on real embedded
PostgreSQL, not by re-running the lane's tests. Findings below are real but
none of them blocks the merge; F1 and F2 need to be carried forward as
explicit follow-ups rather than lost.

## What I ran

- `npx tsc --noEmit` — clean (exit 0).
- `pnpm run lint` (orphan-audit architecture + source) — `violations: []`, `blocking: []`.
- `npx vitest run tests/unit tests/architecture` — 74 files, 525 tests pass.
- `npx vitest run tests/integration` — 11 files, 118 tests pass (includes the
  FR-0.6 AC5 persisted panel-isolation differential and the whole lane-04/05 set).
- Two independent adversarial harnesses of my own, driving
  `runEvaluatorJudgeAddon` / `runEvaluatorJudgeGradingAddon` /
  `PostgresEvaluatorAddonRepository` against a fresh embedded PostgreSQL with
  the full migration chain (46 + 5 assertions). Only 4 "failures" appeared and
  all four are analysed below: one is my own harness bug (bigint→string
  `register_version`), two are deliberate contract behaviour, one is F7.

## Blinding — verified on the wire, PASS

I seeded a judged artifact whose identity was planted in every place I could
reach: `maker:acme-secret`, `provider:acme-cloud`, `acme-supermodel-9000`,
`acme-v9.9.9`, a `metadata_json` of `{maker, model, org}`, and extra
`author_signature` / `system_fingerprint` keys inside the judge's `raw_text`.
I then captured the actual `ProviderGateway.call` request object and serialised
the whole envelope, not just the packet:

```json
{"runId":null,"subjectItemId":"evaluator:addon-attempt:37e01d1a-…",
 "callSiteKey":"evaluator.grade-judge-output.v1","role":"JUDGE","lane":"evaluator",
 "bound":{"maxAttempts":2,"tokenCeiling":256,"deadlineMs":250},
 "contractHash":"56c142e0…","providerRef":"provider:evaluator-vllm",
 "packet":{"messages":[{"role":"system","content":"Grade the supplied anonymous judge output. …Do not infer authorship."},
  {"role":"user","content":"{\"sampleId\":\"opaque:3fff7bb117497ab44a6ea34e\",\"questionExcerpt\":\"Does aspirin reduce stroke risk?\",\"taskExcerpt\":\"Aspirin reduces ischaemic stroke risk in adults.\",\"grade\":\"0.75 (PROBABILITY)\",\"reasons\":[…]}"}]}}
```

Twelve negative assertions pass against the serialised envelope (case-insensitive):
graded maker, graded provider, graded `model_id`, graded `model_version`, graded
`raw_artifact_id`, grader `raw_artifact_id`, `run_id`, `node_id`,
`reduced_judgement_id`, the `author_signature` and `system_fingerprint` keys from
`raw_text`, and the `metadata_json` org string. Nothing nested, nothing
JSON-encoded, nothing in the envelope.

The mechanism is right, not just the outcome: `createBlindEvaluationSample`
(the FR-3.3 shared helper) constructs a fresh five-field DTO and never deletes
keys from arbitrary input, and `extractBlindJudgementReasons`
(`packages/evaluator/src/index.ts:709-728`) pulls exactly three named strings out
of the judge's raw text rather than passing it through. `providerRef` in the
envelope is the *grader's* own routing ref and never reaches the packet.
`sampleId` is `sha256(runId:reducedJudgementId)` truncated — opaque to the model,
which is what Architecture §5.3 asks for.

## Same-maker / lineage guard — DB, PASS

Migration 0026 replaces `evaluator.reject_same_maker_addon()`; the 0023 trigger
on `evaluator.observation` (BEFORE INSERT) survives `CREATE OR REPLACE`, and the
grants mirror 0023 exactly (no privilege drift). I tried four ways to break it:

| attempt | result |
|---|---|
| grader artifact maker == graded maker (run-less) | `PRODUCER_GRADING_FORBIDDEN` |
| grader artifact scoped to the product run | `ADDON_GRADING_LINEAGE_UNRESOLVED` |
| graded artifact belonging to a different run | `ADDON_GRADING_LINEAGE_UNRESOLVED` |
| carry grader/graded refs under `source_kind='REDUCED_JUDGEMENT'` | `observation_check2` CHECK violation |

The trigger is BEFORE INSERT, so the repository's `ON CONFLICT DO NOTHING` cannot
route around it.

## Same-maker / lineage guard — code, PASS

Two separate lies from the gateway:

- gateway reports `maker:evaluator-local-vllm` but the artifact it claims to have
  written carries the judge's maker → `FAILED / ADDON_EXECUTION_FAILED`,
  **0 observation rows** (the DB caught what the code could not see).
- gateway reports the graded judge's own maker →
  `SKIPPED / ADDON_DIFFERENT_MAKER_UNAVAILABLE`, 0 rows, no insert attempted.

Plus the pre-call refusal (`gradedMaker === family.value.maker`) and the
repository's own `PRODUCER_GRADING_FORBIDDEN` throw. Four layers; I could not get
a same-maker grade to land.

## One bounded pass — sequential PASS, concurrent gap (F1)

Poisoned run (gateway always throws), six sequential invocations:

```
calls=3
FAILED:ADDON_PROVIDER_FAILED ×3, then SKIPPED:ADDON_RETRY_LIMIT_REACHED ×3
receipts: STARTED×3, FAILED×3, SKIPPED×3
```

`ADDON_MAX_RUN_ATTEMPTS=3` is enforced from the lane's own `pipeline='ADDON'`
receipts (`count(DISTINCT attempt_id) WHERE state='STARTED'`), never from the
product run's attempt counter. Per invocation the gateway's attempt loop
(`packages/providers/src/index.ts:213`) honours `bound.maxAttempts`, which the
policy schema caps at `ADDON_MAX_PROVIDER_ATTEMPTS=2`; a policy row asking for 3
is rejected as `ADDON_POLICY_INVALID` with zero spend. Sequential worst case is
therefore 3 invocations × 2 HTTP attempts, hard-bounded. Goal-packet constraint 1
satisfied.

Constraint 3 also holds: I confirmed the poisoned add-on run accrued **zero**
`pipeline='HARVEST' state='FAILED'` rows, and the parking selector filters on
`pipeline='HARVEST'` (`apps/evaluator-worker/src/index.ts:169`), so an add-on
caller bug cannot eat a run's harvest strike budget.

See F1 for the concurrent case.

## Adversarial grader output — PASS

Every hostile response leaves the store consistent (0 rows on failure, exactly 1
on success):

| grader response | outcome | rows |
|---|---|---|
| non-JSON refusal text naming the maker | `FAILED/ADDON_CONTENT_REFUSED` | 0 |
| `score: 7` | `FAILED/ADDON_CONTENT_REFUSED` | 0 |
| `score: NaN` | `FAILED/ADDON_CONTENT_REFUSED` | 0 |
| extra `graded_maker` key (strict schema) | `FAILED/ADDON_CONTENT_REFUSED` | 0 |
| `reasons: []` | `FAILED/ADDON_CONTENT_REFUSED` | 0 |
| NUL byte in a reason | `FAILED/ADDON_EXECUTION_FAILED` | 0 |
| `'); DROP TABLE evaluator.observation;--` | `GRADED`, stored as parameterised jsonb | 1 |

The NUL case is the interesting one: PostgreSQL rejects a U+0000 code point in jsonb and the
code returns a typed FAILED with no partial row and no receipt corruption.

## Null-run scope, sampling, append-only, dark launch — PASS

- Call carries `runId: null` and `subjectItemId: evaluator:addon-attempt:<uuid>`,
  matching the tagger. FR-0.6 AC5 differential and the whole lane-04/05
  integration set are green on this branch.
- Sampling is register-owned (`evaluatorJudgeAddonPolicy`), not a hidden literal;
  `shouldSampleEvaluatorAddon` is a pure deterministic `ordinal % N === 0` over an
  append-only global run ordinal. `N=1000` skips with zero spend. Documented in
  `packages/evaluator/README.md`. FR-4.1 AC4 satisfied.
- `collectionState` is a `z.literal("COLLECT_ONLY")`: I planted a register row
  claiming `"DISPATCH"` and it was refused (`ADDON_POLICY_INVALID`, zero provider
  calls). No BOUND state, no dispatch path, no routing read. DR-179 grep over the
  diff is clean.
- Absent policy row → explicit `ADDON_POLICY_UNAVAILABLE` SKIPPED receipt
  (Architecture §5.3), verified in the DB.
- Un-harvested run → `ADDON_HARVEST_REQUIRED`, zero spend; ordering law holds.
- `UPDATE`/`DELETE` on `evaluator.observation` and `evaluator.pipeline_event` are
  refused by `core.reject_mutation`. `answer_outcome_id` stays NULL, so an add-on
  row can never masquerade as settlement.

## Clock hunt — nothing found

`observedAt = input.observedAt ?? new Date()` mirrors the merged harvest
convention (`harvestTerminalRun(runId, observedAt = new Date())`). Nothing in the
new production code compares to `now()`, no date literals, no TTLs, no
`Date.parse` of external input. The `2026-08-15` literals live only in tests as
inputs, never in comparisons. The default-clock path was exercised end-to-end and
persisted a sane `observed_at`. The run ordinal is a `count(*)` over
append-only `core.run` — deterministic, though it is an O(N) scan that grows
forever (performance note, not correctness).

---

## Findings

**F1 (medium, follow-up) — no concurrency lock; the call ceiling is read-then-act.**
Six *concurrent* invocations for the same run made **6 provider calls** (1
observation, deduped by the observation unique key + `ON CONFLICT DO NOTHING`).
`ALREADY_GRADED` and the `ADDON_MAX_RUN_ATTEMPTS` count are plain reads with no
`pg_advisory_xact_lock`, unlike lane-05 harvest
(`packages/evaluator/src/index.ts:1789,1803`) and the domain-admission path
(`:1063,1067`). Worse, the duplication is invisible afterwards: the partial index
`evaluator_pipeline_one_success` rejected 5 of the 6 SUCCEEDED receipts and
`recordTerminalEvent` swallows that error by design, so the receipts show one
success.
Not a blocker: nothing schedules the add-on today (F3), the merged tagger has the
same read-then-act posture for its one call per run, and the grader is the local
vLLM (`LOCAL_VLLM`, unmetered) so this is compute, not subscription spend. It
**must** be fixed — one advisory lock around candidate-load + STARTED, exactly as
harvest does — before any selector or scheduler drives this pass.

**F2 (medium, doc) — migration 0026 contradicts Architecture.md §3.4 as written.**
0023 and Architecture §3.4 (~line 368) require `grader_run = NEW.run_id`; 0026
requires `grader_run IS NULL`. The change is correct and necessary — the null-run
law makes grader artifacts run-less, so the shipped 0023 trigger would have made
the add-on permanently unwritable — and it is tested (I confirmed a run-scoped
grader is refused) and explained in the README and the migration header. But the
architecture document now disagrees with the database. §3.4 and §5.3 should be
amended so the doc records the reconciliation rather than leaving drift.

**F3 (low) — no production caller.** Harvest ships `reconcileEvaluatorTerminalRuns`;
the add-on ships only the exported entry point. Ticket 06's handoff does not
demand a scheduler, so this is legitimately deferred, but as merged the pass
cannot run in a deployment. Whoever wires it must land F1 first.

**F4 (low) — no receipt for an invalid policy or a failed preflight.** Worker-path
`ADDON_POLICY_INVALID` and `ADDON_PREFLIGHT_FAILED` return before
`runEvaluatorJudgeAddon` is entered and write no `evaluator.pipeline_event`
(measured: `addon_receipts=0`). Architecture §5.3 mandates the explicit event only
for an *absent* row, which is honoured — but a malformed register row leaving no
audit trail at all is a cheap gap to close.

**F5 (low) — the STARTED receipt escapes the typed contract.** The
`recordPipelineEvent(…, "STARTED", …)` call sits outside the `try`, so a transient
DB error rejects `runEvaluatorJudgeAddon` with an untyped throw instead of an
`EvaluatorJudgeAddonResult` (reproduced). No spend and no strike consequence,
but the declared contract is not honoured on that path.

**F6 (low) — unbounded grader reason payload.** `addonGradeSchema.reasons` has no
array-length or string-length cap; a 20 000-entry response persisted a 1.33 MB
`outcome_json`. The policy `tokenCeiling` bounds this in practice, but a `.max()`
on the array and on each string is nearly free.

**F7 (informational) — maker equality is exact-string.** `Maker:Judge ` against
`maker:judge` is accepted by the trigger. The merged
`ledger.reject_same_maker_node_review` (0019) uses the same plain `=`, so this is
a system-wide convention, not a lane-06 regression. Recording it for the mission
hardening list only.

**F8 (informational, escalation) — "different lineage" is only as strong as the
synthetic evaluator maker.** The grader's maker is always the foundation constant
`maker:evaluator-local-vllm`, not the maker of the weights the container serves,
so the guard structurally cannot fire even if the local vLLM runs a panel maker's
model family. Lane 02 / architecture owns that constant, so it is out of scope
here — but the add-on is the one place where the different-lineage law is
load-bearing, and V/architecture should be told that the guard is a *maker-string*
guard, not a lineage guard.

**F9 (nit)** — `ADDON_MAX_PROVIDER_CALLS = 1` is exported and never referenced.

**F10 (informational)** — a schema-valid identity guess from the grader is stored
verbatim in `outcome_json.reasons` (reproduced: "This judge is obviously
maker:acme-secret running acme-supermodel-9000."). That is auditable evidence
rather than corruption — the row's own identity columns are unaffected — but
ticket 07 must not treat reason text as neutral prose.

**F11 (low)** — `ALREADY_GRADED` keys on `(run_id, source_kind)` only, while the
observation unique key includes `derivation_version`. Bumping
`policy.derivationVersion` therefore never re-grades a run. Fine today; align the
two if re-derivation is ever wanted.

## Requirement trace

| Item | Status | Evidence |
|---|---|---|
| FR-4.1 AC1 sampled run produces an add-on observation | PASS | end-to-end on embedded PG |
| FR-4.1 AC2 write path refuses grader maker == graded maker, not via 0019 | PASS | 4 layers; DB trigger is evaluator-owned |
| FR-4.1 AC3 authorship stripped via the FR-3.3 helper | PASS | captured wire body, 12 negative assertions |
| FR-4.1 AC4 sampling documented and testable | PASS | register row + README + unit tests |
| FR-4.2 feeds ticket 07 | PASS | step JUDGING, `judging.blind-grade.v1`, `BLIND_ADDON` |
| FR-0.7 AC2 guard compares makers | PASS | trigger and code both compare `maker` |
| FR-0.6 AC5 / lane-04 differentials | PASS | full integration suite green |
| Goal-packet constraint 1 (own retry bounds) | PASS | 3 invocations × 2 attempts, receipts-driven |
| Goal-packet constraint 2 (null-run scope) | PASS | `runId: null`, evaluator subject, differentials green |
| Goal-packet constraint 3 (no harvest strike theft) | PASS | 0 HARVEST FAILED rows; selector scoped to HARVEST |
| Goal-packet constraint 4 (isolation assert before any call) | PASS | collision fixture → SKIPPED, 0 calls |
| No BOUND, DR-179, append-only, no non-evaluator behaviour change | PASS | schema literal, grep, mutation guards, additive diff |
