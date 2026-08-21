# PROG-05 — Opus2 reviewer (seat substituting Grok), review 2 (codex/eval-05-harvest @ 720303d)

Reviewer: Opus2 (second independent reviewer), 2026-08-15. Read-only review of
`720303d "fix(evaluator): reconcile late settlements safely"` on top of the
round-1 head `50b1a17`, in
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest`.
Binding docs unchanged from review 1 (Architecture §1.4/§1.5, §2, §3.3, §3.4,
§5.2, §7 tier-3, §8; Requirements §3 + FR-0.x; goal packet). No other PROG-05
review file was read.

## VERDICT: REWORK

B2 is **closed**. B1 is **half closed and has introduced a worse failure
mode**: the new supersession write is unsafe against the settlement's own
`resolved_at`. Whenever an external outcome resolves *earlier* than the
consensus observation's `observed_at` — which is the ordinary case for a
resolver that dates a settlement to when the world settled, and the *universal*
case for a run that was already settled before its first harvest — the
`validate_observation_supersession` trigger raises and the **entire harvest
transaction is lost**. Round 1 dropped late settlements silently; round 2 now
loses the whole run's harvest, and one poisoned run aborts the batch
reconciler for every run behind it.

---

## 1. What I ran (round 2)

Same method as review 1: independent fixtures on real embedded PostgreSQL 18
through `startTestDatabase()` + full `migrate()`, `globalThis.fetch` replaced by
a throwing stub for the whole harness. Repository gates re-run at 2026-08-15
10:17 UTC: `pnpm run typecheck` clean; `npx vitest run` 87 files / 639 tests
passing (incl. the lane's new `evaluator-harvest-rework.test.ts` and the FR-0.6
AC5 differential); `pnpm run lint` → `violations: []`, `blocking: []`.

Round-1 green surface — **all still green** (A1–A9, G1–G2):
exact consensus row set with correct actor per step (author→AUTHORING,
judge→JUDGING, reviewer→REVIEWING); authoritative `question_domain` on every
row and NULL when untagged; evaluator call-site attempt excluded even though its
artifact is null-run-scoped and authored a `core.node`; version-less identity
never merged; zero `fetch` calls and unchanged `MODEL_CALL` count across
harvest; worker-owned metering (4 usage rows, LOCAL_VLLM cost 0 vs paid 1.0,
UNMETERED judge) and cost cells intact; re-harvest with no new settlement
returns `ALREADY_HARVESTED` with no duplicate rows; mid-flight run neither
harvested nor receipted; `evaluator.observation` UPDATE and DELETE both refused;
`scorecard.answer_outcome` never written by harvest.

New checks:

| Check | Result |
|---|---|
| B2 — `MODEL_IDENTITY_INCOMPLETE:<artifact>` SKIPPED receipt for a version-less source | PASS |
| B2 — STARTED + FAILED receipts survive a forced observation-write failure (I injected a `NOT VALID` CHECK, not the lane's own trigger) | PASS |
| B2 — a failed run still harvests cleanly on retry | PASS |
| B1 — **forward-dated** late settlement projected after `ALREADY_HARVESTED` | PASS — `SETTLEMENTS_RECONCILED`, 1 row, `truth_basis='SETTLEMENT'`, `answer_outcome_id` set, `metric='prowess.outcome.v1'` |
| B1 — `supersedes_observation_id` = the prior consensus `NODE_STRENGTH` row | PASS |
| B1 — lane-07 `consensus_count`/`settlement_count` feedable | PASS — `[{CONSENSUS,1},{SETTLEMENT,1}]` on the same (step, metric) key |
| B1 — settlement reconciliation itself idempotent | PASS — second pass `ALREADY_HARVESTED`, count unchanged |
| **B1' — settlement resolved *before* the consensus row's observed_at (late arrival, backdated resolution)** | **FAIL — `OBSERVATION_SUPERSESSION_INVALID`; harvest throws; no settlement row ever** |
| **B1'' — run already settled at first harvest with an earlier `resolved_at`** | **FAIL — first harvest throws; the run ends with ZERO observations, consensus included** |
| **B1''' — batch reconciler with one such run in the set** | **FAIL — `reconcileEvaluatorTerminalRuns` propagates the error and aborts the whole batch** |

---

## 2. Blockers

### B3 (blocking) — supersession is written without honouring the trigger's time ordering; the run's whole harvest is lost

The settlement observation's `observed_at` is the *outcome's* `resolved_at`
(`packages/evaluator/src/index.ts:1249`,
`observedAt: new Date(settlement.resolvedAt)`), while the consensus row's
`observed_at` is the *harvest's* wall clock (`:1155`, from
`harvestTerminalRun(runId, observedAt = new Date())` at `:1278`). Migration
0023's guard refuses any supersession where
`NEW.observed_at < prior.observed_at` (`migrations/0023_evaluator_foundation.sql:197`).

Nothing in the new code compares those two timestamps before setting
`supersedes_observation_id` (projector match at `:1220-1228`, in-transaction
fallback at `:1330-1345`), so the pairing succeeds or explodes purely on clock
luck.

Reproduced twice, live:

- **Late, backdated settlement.** Harvest at `09:00Z`; outcome inserted
  afterwards with `resolved_at = 07:00Z`. Re-harvest →
  `OBSERVATION_SUPERSESSION_INVALID: prior … new …`; receipts
  `[STARTED, SUCCEEDED, STARTED, FAILED]`; observation table still shows only
  CONSENSUS rows. Every retry repeats it — the settlement is permanently
  unharvestable, which is strictly worse than round 1 (silent drop) because it
  now burns a FAILED receipt each pass.
- **Already-settled at first harvest.** Outcome `resolved_at = 07:00Z`, first
  harvest at `09:00Z` → the *first* harvest throws. Final state for that run:
  `[]` — no consensus rows, no judging rows, nothing. Round 1 handled this case
  correctly (it produced consensus + settlement rows). This is a regression
  against my own review-1 evidence.
- **Batch blast radius.** With one such run present,
  `reconcileEvaluatorTerminalRuns` threw out of its serial loop
  (`apps/evaluator-worker/src/index.ts:120-125` has no per-run guard), returning
  nothing and skipping every remaining terminal run. A single poisoned run
  stops evaluator collection wholesale.

Why this is the *ordinary* case, not an exotic one: `resolved_at` is the
external resolver's resolution time, and `packages/settlement` copies it
straight through; harvest time is unrelated wall clock. Any resolver that dates
a settlement to when the question actually resolved — or any re-harvest of a
backlog — produces `resolved_at < harvest time`.

The lane's own regression test only passes on a clock accident:
`tests/integration/evaluator-harvest-rework.test.ts:153` hardcodes
`resolved_at = 2026-08-15T12:00:00.000Z` while `:182` harvests with the default
`new Date()`. I ran the suite at 10:17 UTC and it was green. From
2026-08-15T12:00:00Z onward — i.e. later today and on every subsequent day —
that fixture inverts and the test must fail with
`OBSERVATION_SUPERSESSION_INVALID`. This is a time bomb, not a flake: the
"proof" of B1's fix expires in under two hours.

Fix directions (lane's choice, but the invariant must be explicit):

- give the settlement observation an `observed_at` that cannot precede the row
  it supersedes (e.g. `max(resolvedAt, prior.observed_at)`, keeping the true
  `resolved_at` in `outcome_json`/`provenance_json` where nothing is lost), or
- skip the supersession link (insert the settlement row with
  `supersedes_observation_id = NULL`) when the ordering would be invalid, and
  record why, or
- pre-check the ordering in the fallback query (`prior.observed_at <= $observed_at`)
  so the trigger is never reached.

Whichever is chosen: pin the fixture clocks in the tests (both directions —
`resolved_at` before *and* after the harvest timestamp), and add a per-run guard
in `reconcileEvaluatorTerminalRuns` so one failing run cannot abort the batch.

---

## 3. Closed since review 1

- **B2 closed.** Version-less sources now emit
  `SKIPPED / MODEL_IDENTITY_INCOMPLETE:<raw_artifact_id>`
  (`packages/evaluator/src/index.ts:1312-1326`), evaluator-excluded attempts are
  correctly *not* reported as skipped identities, and the two-transaction
  restructure makes STARTED durable so a genuine failure now leaves
  `[STARTED, FAILED]` (verified with my own injected constraint, independent of
  the lane's fixture).
- **B1 partially closed.** Forward-dated late settlements do reach
  `evaluator.observation` with a correct supersession link, the batch selector
  now finds runs whose accepted outcomes have no observation
  (`apps/evaluator-worker/src/index.ts:99-113`), the metric was unified to
  `prowess.outcome.v1` so the §3.4 trigger's same-metric rule can be satisfied,
  and lane 07 can now count consensus vs settlement on one key.
- Round-1 non-blocking items 3 and 5 were addressed too: the batch reconciler
  gained a `limit` (default 100), and `recordCall`'s conflict handling now
  covers the `raw_artifact_id` uniqueness with a typed
  `MODEL_CALL_USAGE_WRITE_FAILED` instead of a `!` dereference.

## 4. Non-blocking findings (new this round)

1. `reconcileMeteringBestEffort` (`apps/evaluator-worker/src/index.ts:129-139`)
   swallows *every* metering error and reports `callsFailed: 1`. Keeping harvest
   independent of metering is right, but a blanket `catch {}` with a synthetic
   count of 1 hides programming errors and mis-states the failure count; prefer
   a typed reason or a FAILED metering receipt.
2. Every re-harvest of an already-harvested run now appends a `SKIPPED /
   NO_NEW_SETTLEMENTS` receipt and burns a sequence, so a periodic reconciler
   grows `evaluator.pipeline_event` without bound on runs that will never
   settle. Consider recording the receipt only when something was inserted.
3. The snapshot is now read twice per harvest (once in the prepare transaction
   at `:1289`, once in the write transaction at `:1306`), and the advisory lock
   is released between them; correctness is preserved by the second lock plus
   the natural key, but it doubles the read cost of every harvest.
4. Semantics of the unified metric: consensus `prowess.outcome.v1` carries a
   propagated node strength (continuous) while the settlement row carries a
   binary resolved outcome. Sharing one metric name is what makes supersession
   expressible, but lane 07 must not average the two feeds blindly — worth
   stating in the README next to the supersession rule.
5. Round-1 finding 1 (exclusion depends solely on call-site evidence) and
   finding 4 (calls whose artifact lacks a model version are invisible even as
   unmetered) remain open; both stay non-blocking.

## 5. Exit criteria for review 3

1. A run whose settlement `resolved_at` precedes the consensus `observed_at`
   harvests successfully — both when the outcome exists before first harvest and
   when it arrives after — with the supersession either correctly ordered or
   deliberately omitted.
2. Fixture clocks pinned on both sides of the harvest timestamp so the proof
   does not depend on when the suite runs.
3. `reconcileEvaluatorTerminalRuns` cannot be aborted by one failing run.
4. Re-run of typecheck, full vitest, and both audits.
