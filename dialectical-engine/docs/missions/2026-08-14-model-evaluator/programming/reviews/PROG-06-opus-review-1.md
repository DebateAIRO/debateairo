# PROG-06 — Opus reviewer A, round 1

Lane: `codex/eval-06-addon` (Codex), commit `ebdff73`
Worktree reviewed: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`
Diff base: `git diff dev...codex/eval-06-addon` — 6 files, +1070 / -0
Reviewer: Opus A (read-only outside this file and my self-report; no commits; no other review files read)

## Verdict

**REWORK** — four blockers. None of them are architecture-wrong; the shape of the
lane is right and the hard parts (blinding, null-run scope, DB guard) are done
well. The blockers are a mandated test that was never actually written, an
attempt-accounting ordering defect that can permanently poison runs from a pure
config fault, two silent terminal paths with no receipt, and an undisclosed
amendment of a binding architecture artifact.

## Verification I ran myself

| Check | Command | Result |
| --- | --- | --- |
| Repository typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Unit + architecture suites | `npx vitest run tests/unit tests/architecture` | **74 files / 525 tests passed** |
| Full integration suite | `npx vitest run tests/integration` | **11 files / 118 tests passed** |
| FR-0.6 AC5 differential (named) | `npx vitest run tests/integration/evaluator-database.test.ts -t "FR-0.6"` | PASS — "persists byte-identical product membership and agent_count with evaluator healthy versus absent" |
| Lane-04 decoupling differentials | included above: "does not fire product liveness when evaluator tags span model versions"; "keeps the asker-visible execution digest byte-identical with tagging off versus on" | PASS |
| Source orphan audit | `npx tsx tools/orphan-audit/src/cli.ts source` | `{"blocking": []}` |
| DR-179 key scan on the diff | `git diff dev...HEAD \| grep -niE 'api[_-]?key\|sk-…\|bearer \|token=\|secret'` | no hits |
| BOUND scan on the diff | `git diff dev...HEAD \| grep -n BOUND` | no hits; policy schema is `z.literal("COLLECT_ONLY")` |

I did not take the lane's word for any of these; every row above is my own run.

## Axis 1 — deliverables (tier-4 row)

- **Different-lineage grader.** Satisfied, and satisfied structurally rather than
  by selection: the grader is always the isolated evaluator family
  (`maker:evaluator-local-vllm`) and the code refuses when the graded judge's
  maker equals it (`ADDON_DIFFERENT_MAKER_UNAVAILABLE`), before the call and
  again against `response.maker` after it. Note for the record: the code does not
  *search* for a different-maker grader among candidates (it takes `LIMIT 1` on
  the judgement and skips on collision) — acceptable under FR-0.6, which confines
  evaluator model calls to the local vLLM path, but it is a narrower reading of
  §5.3's "selects … a healthy grader whose maker differs" than the prose implies.
- **Blinding via the blind DTO.** Correct and, importantly, resting on the
  foundation helper that already has a real leak test
  (`tests/unit/evaluator-foundation.test.ts` "constructs an allowlist-only blind
  DTO" injects `maker`/`provider`/`modelId`/`rawArtifactRef` and asserts they are
  dropped). The add-on builds the DTO from five allowlisted fields, and the unit
  test asserts the exact serialized payload reaching the gateway with `toEqual`.
  I traced every field that reaches the prompt — `question_line`, `claim_text`,
  `tau`/`number_kind`, and reasons narrowed by `extractBlindJudgementReasons` to
  `restatement_text` / `steelman.summary` / `critic.summary`. No maker, provider,
  model, artifact id, or provenance ref is serialized. The system message carries
  no identity either. **Blinding: green.**
- **One bounded pass per run.** One `ProviderGateway.call` per invocation,
  asserted `toHaveBeenCalledTimes(1)` in both unit and integration. Gateway-side
  retries bounded by `bound.maxAttempts`, schema-capped at
  `ADDON_MAX_PROVIDER_ATTEMPTS = 2`. Cross-invocation cap
  `ADDON_MAX_RUN_ATTEMPTS = 3` — see blocker B1 for its test status.
- **Sampling policy.** Register-owned `evaluatorJudgeAddonPolicy`, strict zod,
  `everyNthRun` over an append-only run ordinal, `N=1` = every run, absent row →
  explicit `ADDON_POLICY_UNAVAILABLE` skip receipt. Documented in the package
  README, unit-tested. FR-4.1 AC4 satisfied.
- **Observation rows.** `step='JUDGING'`, dedicated metric
  `judging.blind-grade.v1`, `truth_basis='BLIND_ADDON'`,
  `source_kind='BLIND_JUDGE_GRADE'`, profile identity = the *graded judge's*
  exact `(provider, model_id, model_version)` triple (FR-0.7 AC1 respected),
  graded and grader artifact refs both persisted for ticket 07. Correct.
- **DB-level maker guard.** Present and tested on both arms in
  `tests/integration/evaluator-addon-database.test.ts` (accept different maker,
  reject `PRODUCER_GRADING_FORBIDDEN`). Code-level refusal in
  `PostgresEvaluatorAddonRepository.insertObservation` as well. FR-4.1 AC2
  satisfied without depending on migration 0019.

## Axis 2 — the four mandatory constraints

1. **Own retry bounds, never product counters.** Honored in design: the product
   run's attempt counter is nowhere in the add-on path; bounds are
   `ADDON_MAX_PROVIDER_ATTEMPTS` (in-call) and `ADDON_MAX_RUN_ATTEMPTS`
   (cross-invocation, counted from evaluator ADDON `STARTED` receipts). **Not
   honored in tests** — blocker B1.
2. **Null-run scope.** Honored. `runId: null`,
   `subjectItemId: evaluator:addon-attempt:<uuid>`,
   `callSiteKey: evaluator.grade-judge-output.v1`, `lane: "evaluator"`. I traced
   `request.runId` through `packages/providers/src/index.ts` into
   `appendRawArtifact`/`appendLedgerEntry` and confirmed it lands as SQL NULL on
   `ledger.raw_artifact.run_id`. FR-0.6 AC5 and the lane-04 liveness/digest
   differentials are green under my own runs.
3. **Validate before the strike-bearing try, harvest-side.** Honored as written.
   The add-on writes only `pipeline='ADDON'` receipts; the harvest parking
   selector in `apps/evaluator-worker/src/index.ts` filters
   `pipeline='HARVEST'`, so no add-on failure can consume a run's harvest strike
   budget. The worker entry point validates `runId`/`observedAt` before its first
   query, and a unit test proves `pool.query` is never reached. **But the same
   ruling's spirit is violated inside the add-on's own budget** — blocker B2.
4. **Isolation assert before any model call.** Honored — but placed after the
   strike-bearing `STARTED` receipt, which is what B2 is about.

## Axis 3 — FR-0.6 AC5

Green under my own named run. No change to `configuredProviderSet`,
`discovered_panel`, `agent_count`, or `envelopeBasis` anywhere in the diff.

## Axis 4 — BOUND / DR-179 / product behavior

Clean on all three. No `BOUND` token in the diff; the policy `collectionState`
is a `z.literal("COLLECT_ONLY")` so a `BOUND` row cannot parse. No key material.
The diff touches only `packages/evaluator`, `apps/evaluator-worker`, a new
evaluator-scoped migration, and two new test files; 525 unit/architecture and
118 integration tests pass unchanged. Migration 0026 sorts after both `0025_`
files under the migrator's lexicographic `readdir().sort()`, and it re-applies
0023's exact REVOKE/GRANT pair so privilege parity is preserved.

## Axis 5 — test honesty

**Time bombs: none found.** Every clock the tests feed is pinned
(`new Date("2026-08-15T12:00:00.000Z")`); the only unpinned `new Date()` is on a
path that short-circuits at `ALREADY_GRADED` before the clock is used. No test
compares a fixture date against wall-clock now, so nothing here rots on a future
date.

**Vacuous assertions: one, and it sits on a mandated constraint.** See B1.
Everything else I probed held up: the blinding assertion is a real `toEqual` on
the exact serialized payload (not just the weak `not.toMatch` regex that
accompanies it), the DB guard test asserts a thrown
`PRODUCER_GRADING_FORBIDDEN`, and the "no model call" skip tests all assert
`gateway.call` was never invoked rather than merely inspecting the return value.

---

## Blockers

### B1 — The cross-invocation retry bound is never tested; its one test is vacuous

`tests/unit/evaluator-addon.test.ts:141` is titled "stops cross-invocation
retries at the evaluator-owned run ceiling", but it stubs `loadCandidate` to
return the literal `"RETRY_LIMIT_REACHED"` and then asserts:

```ts
expect(ADDON_MAX_RUN_ATTEMPTS).toBe(3);
```

That is a constant compared against its own literal. The test exercises the
*branch that handles* the ceiling, never the ceiling. The actual enforcement
lives in `PostgresEvaluatorAddonRepository.loadCandidate`
(`packages/evaluator/src/index.ts:678-684`) as a
`count(DISTINCT attempt_id) … state='STARTED' >= ADDON_MAX_RUN_ATTEMPTS` query,
and no test in the diff ever puts a row in front of that query. The integration
file covers only the happy path and `ALREADY_GRADED`.

Mandatory constraint 1 says "Bound the pass's calls and retries explicitly,
**with tests**", and the merge gate names "bounded-pass tests (call count
ceiling, **bounded retries**)". The call-count ceiling is genuinely tested; the
retry bound is not.

**Required:** an integration test that seeds three ADDON `STARTED` receipts for a
run against the real repository and asserts `loadCandidate` returns
`RETRY_LIMIT_REACHED` and no fourth `provider.call` occurs. Delete the
tautological `toBe(3)` line while you are there.

### B2 — A config fault burns a lifetime-capped attempt: `STARTED` is written before the isolation assert

`packages/evaluator/src/index.ts:540-549`:

```ts
await input.repository.recordPipelineEvent({ …, state: "STARTED", … });
try {
  assertEvaluatorProviderIsolation(input.family, input.deployment);
} catch {
  await recordTerminalEvent("FAILED", "ADDON_PROVIDER_ISOLATION_FAILED");
```

Isolation is a *deployment-wide* property, not a per-run one. If the evaluator
provider is ever wrongly enrolled in `configuredProviderSet`, every run the
sweeper touches burns one of its three attempts before the assert can refuse.
Three sweeps under that misconfiguration and **every touched run is permanently
`RETRY_LIMIT_REACHED` and can never be graded, even after the config is fixed** —
because the ceiling counts `STARTED` events over all time with no reset window.
Contrast the harvest precedent in `apps/evaluator-worker/src/index.ts`, whose
strike count only tallies `FAILED` events *after the last SUCCEEDED/SKIPPED*, and
Architecture §5.3's expectation that "a later successful retry creates a new
aggregate derivation version".

This is the lane-05 seat-B class of finding — a fault that is not the run's fault
consuming the run's budget — landing on the add-on's own budget instead of
harvest's. Constraint 3 is technically about harvest-side callers, so I am not
claiming the letter was broken; the ruling's whole point was this failure mode.

**Required:** assert isolation *before* the `STARTED` receipt (constraint 4 is
still satisfied — it only requires the assert precede any model call; the tagger
pattern of re-asserting at the final boundary can be kept as a second assert).
Separately, state whether the 3-attempt cap is intended as a lifetime cap with no
recovery window; if yes, say so in the README, because it differs from the
harvest selector's resettable strike count.

Sub-finding, same site: this path records `state: "FAILED"` but returns
`state: "SKIPPED"`. Ticket 07 reading receipts will disagree with any caller
reading return values. Pick one.

### B3 — Two worker terminal outcomes write no receipt at all

`apps/evaluator-worker/src/index.ts` returns
`FAILED / ADDON_PREFLIGHT_FAILED` (run row missing, non-integer
`register_version`, or `family.registerVersion !== run.register_version`) and
`SKIPPED / ADDON_POLICY_INVALID` *before* it constructs
`PostgresEvaluatorAddonRepository`. Neither writes an `evaluator.pipeline_event`
row. Architecture §5.3 requires "an explicit SKIPPED event, not a fabricated
unbiased result", and FR-4.2 AC requires absence of add-on data to be explicit
rather than silent. Two of the entry point's terminal outcomes are invisible in
the receipt store.

The register-version equality preflight makes this sharper: any run admitted
under a different register version than the currently-loaded family row is
permanently ungradeable, reported as `FAILED`, with no auditable trace of why.
That deserves a receipt at minimum, and probably a `SKIPPED` classification
rather than `FAILED`.

**Required:** write receipts for both paths (construct the repository first, or
hoist a receipt writer), and reclassify the register-version mismatch.

### B4 — Architecture §3.4's trigger body was amended without escalation

Migration `0026_evaluator_judge_addon.sql` replaces
`evaluator.reject_same_maker_addon()`, changing the lineage clause from the
architecture-specified

```sql
OR grader_run IS DISTINCT FROM NEW.run_id
```

to

```sql
OR grader_run IS NOT NULL
```

**The change is correct and necessary** — I verified that `ProviderGateway.call`
passes `request.runId` straight through to `ledger.raw_artifact.run_id`, so under
the null-run scope law the grader artifact is always run-null and the trigger as
specified in Architecture §3.4 would reject *every* real add-on insert with
`ADDON_GRADING_LINEAGE_UNRESOLVED`. The lane found a genuine defect in the
architecture and fixed it in the only direction the rulings allow. The migration
comment and the README both explain it.

What is missing is the escalation. Architecture.md §3.4 still carries the old
body, and the lane's self-report closes with "risks/open questions: deployment
scheduler owns invocation; **no code or architecture blocker**" — an
implementation lane silently rewrote a spec'd DDL artifact and then reported no
architecture issue.

**Required:** raise this as an architecture amendment (DR) so §3.4's trigger body
is corrected in the binding doc, and correct the self-report's open-questions
line. No code change needed.

## Non-blocking findings

1. `ADDON_MAX_PROVIDER_CALLS = 1` (`packages/evaluator/src/index.ts:295`) is
   exported and referenced nowhere in source or tests. Either enforce it or drop
   it; the orphan audit does not catch exported constants.
2. The `STARTED` `recordPipelineEvent` at line 540 is the only repository call
   not wrapped — a DB blip there rejects `runEvaluatorJudgeAddon` outright, while
   every other path returns a typed result. Callers will not expect that.
3. `runOrdinal` is a correlated `count(*)` over `core.run` per invocation — O(N)
   per add-on, O(N²) as the table grows. Fine at dark-launch volume; worth an
   index-backed or registered ordinal before bind.
4. `questionExcerpt` / `taskExcerpt` are the full `question_line` and
   `claim_text` with no length bound; `tokenCeiling` is the only guard. §5.3 says
   "excerpt".
5. No test covers the new `ADDON_GRADING_LINEAGE_UNRESOLVED` rejection arm (a
   grader artifact carrying a non-null `run_id`). The accept arm and the
   same-maker arm are both covered; this one is not.
6. `recordTerminalEvent` swallows all receipt errors, including a
   `SUCCEEDED`-receipt collision against the §3.3 partial unique index. An
   observation can therefore exist with no `SUCCEEDED` ADDON receipt, which
   ticket 07 should not be surprised by.

## What is genuinely good here

Worth saying plainly, because the blockers are all fixable in an afternoon and
the substance is not: the blinding is the strongest part of the lane — an
allowlist DTO built from a helper that already has a real injected-leak test,
with the exact serialized payload asserted at the gateway boundary. The null-run
plumbing is right end to end and I confirmed it against the provider source
rather than the report. The maker guard is enforced at three independent layers
(pre-call, post-response, and DB trigger) and both DB arms are tested. And the
lane caught a live defect in the architecture's own trigger — it just did not say
so out loud.
