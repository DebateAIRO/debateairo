# PROG-09 — Opus reviewer A, round 1

- Lane: `codex/eval-09-consumer` (Codex implementation lane, tier 6A, wayfinder ticket 09)
- Commit reviewed: `4f0356a` (`feat(evaluator): add blinded consumer reader`)
- Diff base: `dev...codex/eval-09-consumer` — 10 files, +1868/-3
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer`
- Binding docs: Architecture §2.3, §3.7, §4, §5.3, §5.4, §7 tier-6A row, §8; Requirements FR-7.1, FR-3.3, FR-0.3, ruling 3; goal packet `PROG-09-codex-consumer.md` (five mandatory constraints)
- Reviewer scope: read-only outside this file and my self-report; no commits, no branch mutation

## Verdict

**REWORK** — four blocking findings. The scaffolding is genuinely strong: null-run
discipline, versioned append-only persistence, the claim/receipt protocol, the
strict output contract, and target-identity blinding are all real and
non-vacuously proven against a live PostgreSQL path. The blockers are all on the
**sample half** of the prompt contract and on the **naming of the self-routing
refusal** — plus one flatly missing mandatory regression.

Specifically: the blinded-sample DTO is hand-rolled in the repository instead of
going through the shared helper that Architecture §5.3 explicitly assigns to this
reader; and no test ever puts a real sample into a prompt, so the one production
code path that moves product text into an LLM-visible surface has zero coverage.

---

## What I ran myself

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`) | clean, no output |
| `npx vitest run` (full repository) | **706 passed / 706, 98 files, exit 0** |
| `npx vitest run tests/unit` | 487 passed / 62 files |
| `npx vitest run tests/integration tests/architecture` | 187 passed / 29 files |
| `npx vitest run tests/integration/evaluator-consumer-database.test.ts` | 5 passed (embedded-postgres, DR-121 path) |
| lane-04/05/06 differentials (`evaluator-tagger`, `evaluator-harvest`, `evaluator-harvest-rework`, `evaluator-addon`, `evaluator-addon-database`) | pass |
| FR-0.6 AC5 differential (`tests/integration/evaluator-database.test.ts`) | pass, 20/20 |
| `pnpm run lint` (`audit:architecture` + `audit:source`) | `edgeRowsChecked: 27, violations: []`; `blocking: []` |
| `git status --porcelain` | clean; no push, no board mutation |
| DR-179 secret scan over the diff (`sk-`, `api[_-]?key`, `bearer `, `secret=`, `token=`) | no hits |
| `BOUND` scan over the diff | only the self-report sentence "No BOUND state…"; no BOUND state authored |
| lane-10 scope scan (`seat`/`alloc` in changed paths) | no hits — lane boundary respected |
| SQL column existence for the untested `listJobs` sample join | verified against `0000_s00.sql` / `0023_evaluator_foundation.sql`; `source_ref` is the bare `reduced_judgement_id` (`packages/evaluator/src/index.ts:1753`), so the join is structurally valid |

The self-report's claimed numbers reproduce exactly. No dishonest reporting found.

---

## Blocking findings

### B1 — The consumer bypasses the shared blinding helper (Architecture §5.3, FR-3.3)

Architecture §5.3, last paragraph, is unambiguous:

> The blinding helper builds a new DTO from approved fields; it does not
> recursively "delete known identity keys" from arbitrary input. **The same helper
> supplies grading-adjacent samples to the consumer reader.**

FR-3.3 repeats it: "blinding is required on the **shared helper** used by FR-4.1
and FR-7.1", traceability tickets 05, 06, **09**.

`createBlindEvaluationSample` exists at `packages/evaluator/src/index.ts:268` and
is used by the add-on path at `:569`. The consumer never calls it. Instead
`PostgresEvaluatorConsumerRepository.listJobs`
(`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer/DebateAI-V3/packages/evaluator/src/consumer-postgres.ts`)
constructs the DTO inline:

```ts
      samplesByModelDomain.set(key, Object.freeze([...current, Object.freeze({
        sampleId: `opaque:sample-${sha256(row.observation_id).slice(0, 24)}`,
        questionExcerpt: row.question_line,
        taskExcerpt: row.claim_text,
        grade: `${row.tau} (${row.number_kind})`,
        reasons: Object.freeze([])
      })]));
```

The selected columns happen to carry no maker identity today, so I found no live
leak. But this is exactly the divergence the architecture legislated against: two
independent blinding constructions that can drift, and this one skips the helper's
`BLIND_SAMPLE_*_INVALID` field validation entirely. FR-3.3 AC1 ("unit tests of the
shared blinding helper show maker fields removed before material is passed to an
LLM-visible evaluation path") is not satisfied for this path, because this path
does not go through the helper.

**Fix:** route sample construction through `createBlindEvaluationSample` (extend
the helper if the consumer needs an extra approved field), and assert in a test
that the consumer's samples are helper-produced.

### B2 — The real blinded-sample path has zero test coverage (merge gate: blinding-of-prompt tests)

The consumer integration fixture inserts domains, a probe, a catalog model, a
selection, one null-run raw artifact, and `profile_cell` / `rank_snapshot` rows.
It inserts **no** `core.run`, `core.node`, `ledger.reduced_judgement`, or
`evaluator.observation` rows. Consequently `samplesByModelDomain` is empty for
every job, and the test asserts precisely that:

```ts
      blinded_sample_refs: []
```

So:

- the four-table join in `listJobs` that produces samples never executes against
  data — it is untested SQL on the hot path of every refresh (a failure there is
  swallowed into `CONSUMER_PREFLIGHT_FAILED`, silently degrading every refresh);
- the only assertions about sample blinding run over the hand-built unit fixture
  in `tests/unit/evaluator-consumer.test.ts`, whose `blindedSamples` are *already*
  opaque (`"opaque:sample-1"`). That is a fixture bypassing the real read path —
  it proves the prompt builder copies opaque values through, not that the
  repository produces opaque values;
- the merge-gate item "blinding-of-prompt tests (captured request body carries no
  authorship)" is therefore only half-discharged. Target identity blinding **is**
  genuinely proven on the real path (`requestBytes` asserted free of
  `provider:evaluator-vllm`, `consumer:local`, `consumer-v1`), and I credit that.
  Sample blinding is not proven at all.

`blinded_sample_refs` is a first-class column in the Architecture §3.7
`consumer_output` DDL; shipping it permanently empty in every test is not
evidence that the feature works.

**Fix:** insert real `core.run` / `core.node` / `ledger.reduced_judgement` /
`evaluator.observation` fixtures for the target, and assert on the captured
request body that (a) samples are present, (b) they carry the opaque id and no
provider/model/version/artifact/maker bytes, and (c) `blinded_sample_refs` is
non-empty in the persisted row.

### B3 — Self-routing refusal is neither typed nor named `SELF_ROUTING_FORBIDDEN` (Architecture §2.3, FR-0.3 AC2, merge gate)

Architecture §2.3: "A model-supplied numeric rank/routing input is rejected with
`SELF_ROUTING_FORBIDDEN`." FR-0.3 AC2 allows "`SELF_ROUTING_FORBIDDEN` (or
equivalent typed domain error) … including the consumer model". The merge gate
lists "self-routing and authorization tests" first.

What the lane actually does (`packages/evaluator/src/consumer.ts`):

```ts
  if (!parsed.success) throw new TypeError("CONSUMER_CONTENT_REFUSED");
```

Three problems:

1. It is a bare `TypeError`, not the repo's `TypedDomainError` used by both
   existing self-routing sites (`packages/settlement/src/index.ts:332`,
   `packages/evaluator/src/index.ts:2629`). "Equivalent typed domain error" is not
   met by an untyped `TypeError`.
2. The persisted receipt reason is `CONSUMER_CONTENT_REFUSED` for *every* rejection
   — a `numeric_rank`/`route_to` injection is stored indistinguishably from
   truncated JSON or an empty string. An auditor cannot answer "did the consumer
   ever try to route itself?" from the receipt store. That is the whole point of
   the named error.
3. No test asserts a self-routing-typed outcome. The two adversarial tests assert
   `CONSUMER_CONTENT_REFUSED`, which is the generic arm.

The **substantive** guarantee (strict zod schema, adjacent-domain allowlist,
dedupe, no numeric write path) is correct and I found no way through it. This is a
typing/naming/observability blocker, not a hole.

**Fix:** raise a `TypedDomainError("SELF_ROUTING_FORBIDDEN", …)` on the
numeric/routing-field arm specifically, record it as a distinct receipt reason,
and test it separately from malformed-JSON refusal.

### B4 — Mandatory constraint 4: no above-pool-max regression, and a lock was added

Packet constraint 4: "pg_try_advisory_lock + typed in-flight skip if you guard
anything per-run; **regression above pool max if you add any lock**."

The lane added `pg_try_advisory_xact_lock` in `claimJob`. The concurrency test
runs **three** concurrent refreshes. `createPool` (`packages/db/src/index.ts:65`)
is `new PgPool({ connectionString })` — pg's default `max` is 10. Three is not
above pool max. The in-repo precedent is explicit:
`tests/integration/evaluator-addon-database.test.ts:426` — "keeps twelve same-run
invocations above pool max bounded to one provider call", with a second test at
`:462` proving the pool stays usable afterwards.

I believe the design would pass such a regression (no client and no lock spans the
provider call — the transaction commits before `assertConsumerIsolation` and the
gateway call, and mutual exclusion is carried by the durable `STARTED` receipt,
not the lock). But the constraint says run it, and it was not run.

**Fix:** mirror the lane-06 pair at ≥12 concurrent refreshes: one provider call,
N−1 typed in-flight skips, pool usable afterwards.

---

## Non-blocking findings

1. **`persistOutput` hardcodes the family identity.** The authorization query pins
   `provider_ref='provider:evaluator-vllm'` and `maker='maker:evaluator-local-vllm'`
   as SQL literals rather than reading them from the `EvaluatorConsumerFamily`
   register row that the same call already carries. If the register row moves, the
   guard silently rejects every legitimate artifact. Thread the family through.
2. **Receipt reason mislabel.** `persistOutput` throws
   `TypeError("CONSUMER_AUTHORIZATION_FAILED")`, but the caller's catch in
   `runEvaluatorConsumerRefresh` only special-cases `ProviderContentUnacceptedError`,
   `ProviderCallFailedError`, and `CONSUMER_CONTENT_REFUSED` — so this lands as
   `CONSUMER_EXECUTION_FAILED`. An artifact-authorization failure is recorded under
   the wrong reason. No test covers it.
3. **Claim-failure receipts lose job attribution.** The `CONSUMER_CLAIM_FAILED` arm
   calls `recordPreflightReceipt`, whose schema arm forces
   `consumer_selection_id`/target columns to NULL. A receipt exists (no receiptless
   drop — constraint 2 holds), but a repeatedly failing job is not identifiable from
   the store.
4. **No stale-claim recovery.** A worker death between `STARTED` and the terminal
   receipt wedges that `(selection,target,domain,prompt,snapshot)` key as
   permanently `IN_FLIGHT` — the advisory lock is transaction-scoped and releases,
   and the `STARTED` row is append-only with no lease. The self-report declares this
   deliberate and the README documents it; I accept it for this lane, but it should
   be carried as a mission-level operational risk, not left in a lane report.
5. **Near-vacuous self-routing assertion.** `expect(numeric.rows[0]!.count).toBe("1")`
   in the integration test cannot fail: nothing in `PostgresEvaluatorConsumerRepository`
   has an INSERT into `profile_cell`. It is a fine tripwire, but the adversarial
   refusal test is carrying the actual weight — do not let the count assertion read
   as the FR-7.1 AC4 proof.
6. **Unbounded fan-out and unbounded scans.** `listJobs` runs `DISTINCT ON` over the
   whole of `profile_cell` and `rank_snapshot` and a full `observation` join with no
   `LIMIT`, then emits one provider call per `(model, domain)`. Per-call attempts are
   bounded (constraint 2 holds), but the number of calls per refresh is not. Add a
   register-owned cap before this leaves collect-only.
7. **Relative-cost status omitted.** Architecture §2.3 lists the approved prompt
   inputs as profile-cell fields, rank snapshots, **relative-cost status**, blinded
   sample DTOs, and version receipts. `buildEvaluatorConsumerPrompt` carries the
   first, second, fourth and fifth. Under-delivery vs §2.3, though FR-7.1's own text
   ("aggregates and blinded samples") is satisfied. Orchestrator call.
8. **One unpinned clock fallback.** `receiptObservedAt` falls back to `new Date()`
   when `observedAt` is an invalid Date. Only reachable on the preflight-failure arm
   and never exercised; harmless, but it is the one unpinned clock in the diff.
   Every test clock is otherwise explicitly pinned.
9. **Heuristic cell/rank attachment.** Domain jobs additionally absorb domain-`null`
   cells whose metric starts with `"bias."` and domain-`null` `JUDGE` ranks. This
   string-prefix coupling to lane-07's metric naming is undocumented and untested;
   a metric rename silently changes what the consumer sees.

---

## What is genuinely right (so rework does not regress it)

- **Constraint 1 (null-run scope):** every call is `runId: null` with
  `subjectItemId: "evaluator:consumer-attempt:<uuid>"`, `lane: "evaluator"`,
  `callSiteKey: "evaluator.refresh-consumer-output.v1"` — matching Architecture §4
  line 56 exactly. All lane-04/05/06 differentials and FR-0.6 AC5 are green under
  my own run.
- **Constraint 2 (bounded retries, validate-before-strike, typed receipts):** own
  counters only (`CONSUMER_MAX_PROVIDER_ATTEMPTS`, `CONSUMER_MAX_REFRESH_ATTEMPTS`);
  preflight validates trigger/clock/bound/family *before* `listJobs` and before any
  claim, and the test proves `listJobs`/`claimJob`/`provider.call` are all unreached;
  preflight, claim-failure, in-flight, already-current, retry-limit, isolation,
  content-refusal, provider-failure and success all produce receipts.
- **Constraint 3 (isolation):** `assertConsumerIsolation` runs immediately before
  every call and after the claim transaction has committed; no `ProviderGateway` is
  constructed over the repository pool anywhere in the diff, and no pool client
  spans a call. The lane-06 N5 hazard is structurally avoided.
- **Constraint 5 (adversarial safety):** strict zod, JSON-parse guard,
  adjacent-domain allowlist + dedupe, re-parse of the final content after
  `classifyContent`, and a real integration test proving the output table is
  unchanged after a hostile response and that a later honest attempt succeeds at
  `attempt_ordinal 2`.
- **Versioned persistence + both triggers:** `consumer_output` keyed by
  `(selection, target, domain, prompt_version, aggregate_snapshot_hash)` with
  `ON CONFLICT DO NOTHING` against the §3.7 `UNIQUE NULLS NOT DISTINCT` constraint;
  on-demand idempotency (zero calls on re-run) and post-aggregate version bump
  (2 outputs, 2 distinct hashes) both proven on the live path.
- **Migration 0028** carries the append-only trigger, REVOKEs, narrow grants, and
  the receipt-shape CHECKs; the foundation inventory test was correctly updated
  (14→15 tables, 28→30 triggers) rather than weakened.

---

## Round-1 rework list (ordered)

1. B1 — route consumer samples through `createBlindEvaluationSample`.
2. B2 — real run/node/judgement/observation fixtures; assert non-empty blinded
   samples in the captured request body and in `blinded_sample_refs`.
3. B3 — `TypedDomainError("SELF_ROUTING_FORBIDDEN")` on the numeric/routing arm,
   distinct receipt reason, dedicated test.
4. B4 — ≥12-concurrent above-pool-max regression per the lane-06 precedent.
5. Non-blocking 1 and 2 (family threading + receipt reason) are cheap; fold in.
