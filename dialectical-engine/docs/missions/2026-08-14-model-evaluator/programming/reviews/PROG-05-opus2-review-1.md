# PROG-05 — Opus2 reviewer (seat substituting Grok), review 1 (codex/eval-05-harvest @ 50b1a17)

Reviewer: Opus2 (second independent reviewer, substituting the Grok seat per V's
ruling), 2026-08-15. Read-only review of `git diff dev...codex/eval-05-harvest`
in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest`.
Binding docs: Architecture §1.4/§1.5/§1.6, §2 boundary, §3.3/§3.4, §5.2, §7
tier-3 row, §8; Requirements §3 (FR-3.0–FR-3.5), ruling 4, FR-0.5/0.6/0.7;
goal packet `PROG-05-codex-harvest.md`. Judgment formed from scratch; no other
PROG-05 review file was read.

## VERDICT: REWORK

One hard blocker plus one architecture-mandated receipt gap. The deterministic
projector itself is good work — attribution, exclusion, nullable domain, Q59
separation, idempotency and the zero-call property all verified green on real
embedded PostgreSQL. What is missing is the *settlement half* of the lane: a
settlement that arrives after the run was harvested (i.e. every real external
settlement) is never projected, and the supersession machinery lane 02 built
for exactly this is dead code.

---

## 0. How this was verified

Everything below was executed by me, not read off the lane's own tests.

- Repository `pnpm run typecheck` → clean.
- Full `npx vitest run` → 86 files, 634 tests, all passing (includes the
  FR-0.6 AC5 persisted panel-isolation differential in
  `tests/integration/evaluator-database.test.ts:1027`).
- `pnpm run lint` (architecture audit + source audit) → `violations: []`,
  `blocking: []`.
- An independent end-to-end harness (my own fixtures, run through
  `startTestDatabase()` → real embedded PostgreSQL 18, full `migrate()`), which
  seeded: a terminal run with four distinct model identities (author v1,
  reviewer v2, judge v3, a version-less artifact), an authored root node, a
  second node authored by an evaluator artifact, a cross-maker `node_review`, a
  `reduced_judgement`, a `propagation_run` + `node_strength_record`, a
  null-run-scoped evaluator tag artifact with call site
  `evaluator.tag-question.v1`, and a real `evaluator.question_domain` row; a
  second run left mid-flight (`PHASE` event only); and a third run carrying a
  genuine accepted `scorecard.answer_outcome` (`resolver_is_external=true`)
  built on a real `serve.answer` chain. `globalThis.fetch` was replaced with a
  throwing stub for the whole harness.

Observed results (verbatim assertions):

| Check | Result |
|---|---|
| exact `(step, metric, model_id, model_version, truth_basis)` set for the rich run | PASS — `AUTHORING/authoring.artifact.v1/model:author/v1`, `AUTHORING/authoring.strength.v1/model:author/v1`, `JUDGING/judging.tau.v1/model:judge/v3`, `REVIEWING/reviewing.outcome.v1/model:reviewer/v2`, all `CONSENSUS` |
| maker attribution (author→AUTHORING, judge→JUDGING, reviewer→REVIEWING) | PASS — each row's `source_raw_artifact_ref` is the artifact of the correct actor |
| domain = authoritative `evaluator.question_domain` on every row | PASS |
| untagged run harvests with `domain_id IS NULL` | PASS |
| evaluator call-site attempt excluded (even though it authored a `core.node` and its artifact is null-run-scoped) | PASS |
| version-less artifact not collapsed into maker-level identity | PASS (dropped) |
| zero provider calls during harvest | PASS — `fetch` invocations 0; `MODEL_CALL` ledger count 5 before = 5 after |
| re-harvest idempotency (receipt path) | PASS — `ALREADY_HARVESTED`, row count unchanged |
| idempotency with the receipt removed (crash simulation) | PASS — natural key + `ON CONFLICT DO NOTHING` inserted 0 duplicates |
| mid-flight (non-terminal) run not harvested | PASS — `NOT_TERMINAL`, 0 observations, **0 pipeline receipts**; batch reconciler skipped it |
| settlement present at harvest time | PASS — `truth_basis='SETTLEMENT'`, `answer_outcome_id` set, `step='AUTHORING'` |
| Q59 untouched | PASS — `scorecard.answer_outcome` count unchanged by harvest; no INSERT into `scorecard.*` anywhere in the diff |
| metering projected by the **worker** path | PASS — 4 `model_call_usage` rows incl. the evaluator call as `LOCAL_VLLM`; judge call correctly `UNMETERED` |
| relative-cost cells derived, cross-unit rule intact | PASS — local vLLM `relative_cost=0` with 99 tokens vs paid author `1.0` with 15 tokens; unmetered judge `UNKNOWN` |
| append-only compliance of observation writes | PASS — UPDATE and DELETE both refused by `core.reject_mutation()` |
| **late-arriving settlement** | **FAIL** — see B1 |
| **`MODEL_IDENTITY_INCOMPLETE` receipt for the skipped artifact** | **FAIL** — see B2 |

Blinding (FR-3.3 / brief): harvest is pure SQL + deterministic TypeScript. It
takes no `ProviderGateway` (the only `ProviderGateway` use in the package is the
tagger at `packages/evaluator/src/index.ts:894`), and it never even selects
`ledger.raw_artifact.maker` — identity flows exclusively as
`(provider, model_id, model_version)`. There is no model call to blind, proven
both statically and by the fetch ban above.

Boundary (Architecture §2): harvest writes only `evaluator.observation` and
`evaluator.pipeline_event`; the metering reconciler writes only
`evaluator.model_call_usage` and `evaluator.relative_cost_cell`. Reads are
`core.run_progress_event`, `core.node`, `ledger.{raw_artifact,ledger_entry,node_review,reduced_judgement,node_strength_record,propagation_run}`,
`scorecard.answer_outcome`, `evaluator.*`. All inside §2.1/§2.2. No BOUND state,
no dispatch/routing read or write, no API-key material anywhere in the diff
(DR-179 clean), no board mutation, branch is local-only (no push), worktree
clean.

---

## 1. Blockers

### B1 (blocking) — a settlement that arrives after harvest is never observed, and supersession is dead code

`harvestTerminalRun` short-circuits on the versioned success receipt *before* it
reads the snapshot (`packages/evaluator/src/index.ts:1256-1260`):

```
SELECT 1 FROM evaluator.pipeline_event
 WHERE run_id=$1 AND pipeline='HARVEST' AND pipeline_version=$2 AND state='SUCCEEDED'
...
if (prior.rowCount !== 0) return { state: "ALREADY_HARVESTED", runId };
```

`HARVEST_PIPELINE_VERSION` is the literal `1` and nothing in the repo bumps it,
so once a terminal run is harvested its artifact set is frozen forever. The
settlement query (`... FROM scorecard.answer_outcome WHERE run_id=$1 AND accepted`)
only ever runs on the *first* harvest.

Demonstrated: after harvesting the rich run, I inserted a genuine accepted
external `answer_outcome` for it (real `serve.answer` chain,
`resolver_is_external=true`) and re-harvested. Result:
`{"state":"ALREADY_HARVESTED"}`, observation basis breakdown
`[{"truth_basis":"CONSENSUS","count":"4"}]` — **no settlement-fed row, ever**.

This is not a corner case; it is the normal production ordering. External
settlement is resolved by the settlement-watch path days/weeks after the run
reaches TERMINAL, whereas Architecture §1.4 has the evaluator worker harvest as
soon as a TERMINAL event exists without a success receipt. The settlement-fed
population is therefore unreachable in practice, and the only reason the lane's
own integration test looks right is that its fixture inserts the outcome before
the first harvest.

Consequences against binding docs:

- Architecture §1.5: "A later external settlement can cause a new
  settlement-fed AUTHORING observation that supersedes a prior consensus-fed
  observation." Not implemented.
- Architecture §5.2: "If an external settlement arrives later, a new
  settlement-fed observation supersedes the earlier consensus observation; the
  earlier row remains append-only and auditable." Not implemented.
- Architecture §3.4 built `observation.supersedes_observation_id` plus the
  `validate_observation_supersession` trigger for this lane. Nothing in
  `packages/` or `apps/` ever writes that column (only the Drizzle mapping at
  `packages/db/src/schema.ts:815` mentions it) — lane 02's guard is dead code.
- Goal packet deliverable: "settlement outcomes when they exist" — they exist
  after harvest, and are dropped.
- Downstream: lane 07's `prowess.outcome.v1` and `profile_cell.settlement_count`
  would derive from a permanently empty settlement population, and ruling 4's
  consensus-vs-settlement distinction becomes decorative.

Note also that the projector's settlement row uses a *different* metric
(`authoring.external_outcome.v1`) from the consensus authoring row
(`authoring.artifact.v1`). The §3.4 supersession trigger requires
`prior.metric = NEW.metric`, so even if a re-harvest were allowed, the current
metric naming cannot express the designed supersession. Fixing B1 means
deciding the metric/supersession shape, not just re-running the query.

Suggested minimal fix (lane-scoped): keep the receipt as the idempotency guard
for the deterministic artifact families, but let a settlement reconciliation
pass run against already-harvested runs — e.g. a second pipeline family/version
receipt, or a `HARVEST` receipt keyed on the input hash so a changed source set
(settlement arrived) re-projects — and emit the settlement-fed AUTHORING row
with `supersedes_observation_id` pointing at the prior consensus row under a
metric the §3.4 trigger accepts. The append-only natural key already makes the
re-run safe: my crash simulation (receipt deleted, re-harvest) inserted zero
duplicates.

### B2 (blocking, small) — a skipped model identity is silent; no receipt, no distinction from an excluded evaluator call

Architecture §3.4 is explicit: "A source artifact without trustworthy model
version is skipped with a pipeline receipt such as `MODEL_IDENTITY_INCOMPLETE`;
it is not silently merged."

The "not merged" half is honoured — `packages/evaluator/src/index.ts:1131-1134`
filters `modelVersion === null || trim() === ""` out of the artifact map, and my
version-less author produced no observation. But no receipt of any kind is
written: the only pipeline events for the run were
`[STARTED/TERMINAL_HARVEST_STARTED, SUCCEEDED/TERMINAL_HARVEST_SUCCEEDED]`. A
run that lost half its authoring evidence to missing versions is indistinguishable
from a fully harvested run, and, because exclusion of evaluator call sites uses
the same silent `continue`, an auditor cannot tell dropped-evidence from
correctly-excluded-evidence.

Related, same mechanism: `recordPipelineEvent` writes `STARTED` and `SUCCEEDED`
inside the same transaction (`:1349`, `:1369`), so a mid-harvest failure rolls
the `STARTED` row back too. No `FAILED` receipt is ever possible, which
contradicts §3.3's "Events, not mutable job rows, carry retries." Emitting the
skip/failure receipts (skip counts in the SUCCEEDED reason or `input_hash`
payload would also satisfy §3.4) closes both.

---

## 2. Non-blocking findings

1. **Evaluator exclusion has one leg to stand on.** Exclusion is derived purely
   from `ledger_entry.call_site_key LIKE 'evaluator.%'`
   (`:1126-1129`). I confirmed at the pure-function level that an evaluator
   artifact with no correlated call-site row is harvested as an authored node
   (`rows without call-site evidence: [["AUTHORING","evaluator-model"]]`). In
   practice the gateway always appends an entry (the `MODEL_CALL` CHECK forces a
   non-null `call_site_key`, and the catch path still appends), so the exposure
   is a crash between `persistRawArtifact` and `appendLedgerEntry`. Cheap
   hardening: also exclude `provider_ref = EVALUATOR_PROVIDER_REF` / `maker =
   EVALUATOR_MAKER` — belt and braces, and it does not violate the
   "correlate on attempt id" handoff.
2. **Per-run harvest triggers a global metering scan.**
   `runEvaluatorTerminalHarvest` calls `reconcileEvaluatorMetering` first
   (`apps/evaluator-worker/src/index.ts:84`), whose pending query
   (`packages/evaluator/src/index.ts:1710-1735`) has no run filter, no time
   filter and no LIMIT: every single-run harvest scans all unprojected OK
   `MODEL_CALL` entries in history and inserts them one round-trip at a time.
   Correct, but O(history) per terminal run.
3. **`reconcileEvaluatorTerminalRuns` has no batch cap** — it selects every
   terminal run without a success receipt and harvests them serially in one
   call (`apps/evaluator-worker/src/index.ts:50-66`). Fine for dark launch,
   worth a bound before any scheduled wiring.
4. **Version-less calls vanish from cost too.** The metering pending query
   filters `artifact.model_version IS NOT NULL AND length(btrim(...)) > 0`, so
   such calls are not even counted in `unmetered_call_count`. FR-0.5 wants
   unmetered visibility; a call with unknown identity is arguably a different
   bucket, but today it is simply invisible.
5. **`recordCall`'s conflict handling is narrower than the table's uniqueness.**
   `ON CONFLICT (ledger_entry_id) DO NOTHING` plus the
   `existing.rows[0]!.model_call_usage_id` fallback (`:1501-1516`) assumes the
   only possible conflict is the entry id; `model_call_usage.raw_artifact_id` is
   also UNIQUE. Unreachable today (the gateway is 1:1:1
   attempt/artifact/OK-entry, verified in `packages/providers/src/index.ts:213-341`),
   but a second OK entry for one artifact would raise an unhandled unique
   violation and, in the `!` fallback, a `TypeError`.
6. **Metric names and `HARVEST_DERIVATION_VERSION` are package literals**, not
   register-governed. Consistent with the tier-3 scope (Architecture §3.5 names
   only the bias/prowess metrics), but lane 07 will need these pinned.
7. **README accuracy.** The new README section is honest about determinism,
   attempt-id correlation and the nullable domain, but it states settlement
   folding without the "only if the outcome predates first harvest" caveat. If
   B1 is deferred rather than fixed, the caveat must be written down.

---

## 3. What the lane got right (kept for the next round)

- Deterministic projector is genuinely deterministic and side-effect free:
  stable sort key, frozen rows, identical output across runs, and the input hash
  is computed from the projected identity tuple rather than wall-clock data.
- Terminal detection is exactly Architecture §1.4 (`run_progress_event
  kind='TERMINAL'` + absent successful HARVEST receipt), and non-terminal runs
  leave no state at all — not even a receipt.
- Handoff 1 (exclude `evaluator.` call sites), handoff 2 (`question_domain`
  authoritative, nullable), handoff 3 (metering caller is worker-owned; no
  metering write in the product gateway path — confirmed by grep: the only
  `reconcileEvaluatorMetering` call sites are `apps/evaluator-worker`), and
  handoff 4 (correlate evaluator artifacts by `attempt_id`, never `run_id`) are
  all honoured and independently proven.
- FR-3.0/FR-3.2 table separation is real: zero writes to `scorecard.*`,
  consensus rows readable back with `truth_basis='CONSENSUS'` and no contact
  with the `resolver_is_external` CHECK; no consensus discount exists anywhere.
- FR-3.5 Option E only: `domain_id` + `step` columns, no `task_class` encoding.
- FR-0.7: `model:author v1` and `model:reviewer v2` produce distinct keys; the
  version-less artifact is not merged to maker level.
- FR-3.1 AC3: only AUTHORING/JUDGING/REVIEWING are emitted; no COMPOSING or
  CONFORMANCE step appears.
- Idempotency is defended twice (receipt + `UNIQUE NULLS NOT DISTINCT` natural
  key with `ON CONFLICT DO NOTHING`), and the metering inserts gained the same
  discipline in this diff.

---

## 4. Exit criteria for review 2

1. B1: late-arriving settlements reach `evaluator.observation` with
   `truth_basis='SETTLEMENT'`, with a test that harvests **first** and settles
   **second**; supersession either populated per Architecture §1.5/§5.2 or the
   deviation escalated in writing and ruled.
2. B2: a receipt (or an explicit counted field on the SUCCEEDED receipt) makes
   skipped model identities and harvest failures visible.
3. Re-run of typecheck, full vitest, and both audits.
