# Agent self-report — opus2, PROG-05 peer review (second independent reviewer)

Seat: Opus2, substituting the Grok reviewer seat for PROG-05 per V's ruling.
Date: 2026-08-15. Target: `codex/eval-05-harvest` @ `50b1a17`
(`git diff dev...codex/eval-05-harvest`).
Review artifact:
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-05-opus2-review-1.md`

Round 2 target: `720303d "fix(evaluator): reconcile late settlements safely"`.
Round 3 target: `8764ac6 "fix(evaluator): make settlement harvest time-safe"`.
Round-2 artifact: `…/programming/reviews/PROG-05-opus2-review-2.md`
Round-3 artifact: `…/programming/reviews/PROG-05-opus2-review-3.md`

Round 4 target: `1859b75 "fix(evaluator): bound prepare-phase harvest failures"`
(narrow delta after Hermes withheld stage approval on the phase-1 strike gap).
Round-4 artifact: `…/programming/reviews/PROG-05-opus2-review-4.md`

## Verdict — round 4 (current): PASS

Hermes's gap is closed at the right place: validation, the prepare transaction
and the write transaction now sit inside the single `try` whose `catch` persists
`TERMINAL_HARVEST_FAILED` (`packages/evaluator/src/index.ts:1292-1310`,
`:1466-1483`), using a synthetic sha256 hash when the failure predates the real
one.

I reproduced a phase-1 failure with my own mechanism rather than the lane's
(which raises on the STARTED receipt insert): an accepted outcome with
`resolved_at = 'infinity'`, which makes the projector's `toISOString()` throw
while the input hash is computed — inside the prepare transaction, before any
STARTED receipt can exist. 11/11 checks pass: the failure persists exactly one
countable strike with a CHECK-valid hash, the healthy run in the same batch
still harvests, each batch pass adds one strike, the run parks after exactly
three attempts and stays parked, it wrote no partial observations, and a direct
harvest recovers it once the data is corrected.

No regression: my round-2 harness 23/23, round-3 addendum 10/10 (time safety,
supersession ordering, `resolved_at` preservation, multi-settlement, batch
isolation), evaluator tests 36/36 under a wall clock forced to 2026-12-01.
Gates at 10:52 UTC: typecheck clean, 645 tests passing, both audits clean,
worktree clean, branch local-only.

New non-blocking observation: validation now lives inside the strike-bearing
try, so a caller-input bug burns a run's retry budget — I confirmed
`harvestTerminalRun(runId, new Date("nope"))` throws
`EVALUATOR_HARVEST_TIME_INVALID` *and* leaves a FAILED strike on a healthy run.
Batch callers always pass a valid date, so nothing is broken today; before
ticket 06/11 wires more callers, validate before the try or use a distinct
reason the selector does not count.

## Verdict — round 3: PASS

B3 fixed at the root. Settlement `observed_at` is now
`max(harvest observedAt, prior consensus observed_at)` in the projector
(`packages/evaluator/src/index.ts:1230-1233`) and re-checked against the live
prior inside the write transaction (`:1361-1376`), which drops the link with a
`SUPERSESSION_ORDER_INVALID` receipt instead of letting the trigger abort. The
resolver's true `resolved_at` survives verbatim in `outcome_json` and
`provenance_json`, so nothing is fabricated or lost.

All three round-2 reproductions re-run live and now pass: backdated late
settlement reconciles with a supersession link; a run already settled before its
first harvest yields consensus + settlement rows; a poisoned run no longer
aborts the batch (per-run isolation plus a 3-strike circuit breaker). Added
checks also green: order safety (settlement `observed_at` >= prior), `resolved_at`
preservation in both JSON fields, two settlements → both retained with exactly
one link and a typed `SUPERSESSION_PRIOR_UNAVAILABLE` receipt, and direct
recovery of a circuit-broken run. Round-1/2 green surface re-verified (22/22).

Note for the record: the round-3 brief said "it is now past 12:00Z" — it was
10:36 UTC when I ran the gates, so suite greenness alone proved nothing. I
instead confirmed the fixtures are pinned structurally (`resolvedAt` is now a
required parameter; `SETTLED_AT`/`HARVESTED_AT`/`RECONCILED_AT` threaded through
every call) and re-ran the three evaluator test files under a wall clock forced
to 2026-12-01 (my own vitest config + setup file, proven to execute) — 35/35
pass, where round 2 would have raised `OBSERVATION_SUPERSESSION_INVALID`.

Gates at 10:36 UTC: typecheck clean; `npx vitest run` 87 files / 644 tests
passing; both audits clean; worktree clean; branch local-only.

Non-blocking, carried to integration/lane 07: circuit breaker has no reset or
alert surface (a run excluded after 3 failures is not re-selected even after the
cause is removed); `input_hash` now varies per attempt and is no longer a stable
source-set fingerprint; snapshot is captured in the prepare transaction; the
older carry-forwards (call-site-only evaluator exclusion, version-less calls
invisible to metering, unbounded `NO_NEW_SETTLEMENTS` receipts); and lane 07
must replace — never pool — a consensus row named by `supersedes_observation_id`.

## Verdict — round 2: REWORK, 1 blocker (B3)

B2 closed; B1 half closed and now failing worse. The settlement observation's
`observed_at` is the outcome's `resolved_at`
(`packages/evaluator/src/index.ts:1249`) while the consensus row's is the
harvest wall clock (`:1155`), and nothing compares them before writing
`supersedes_observation_id`. Migration 0023's
`validate_observation_supersession` refuses `NEW.observed_at < prior.observed_at`
(`0023_evaluator_foundation.sql:197`), so whenever a settlement resolved earlier
than the harvest ran the whole transaction raises
`OBSERVATION_SUPERSESSION_INVALID`. Reproduced live three ways:

- late settlement with a backdated `resolved_at` → harvest throws, settlement
  permanently unharvestable, one FAILED receipt burned per retry;
- run already settled before its first harvest → the **first** harvest throws
  and the run ends with **zero** observations (a regression against round 1,
  where that case produced consensus + settlement rows);
- `reconcileEvaluatorTerminalRuns` has no per-run guard, so one such run aborts
  the entire batch.

The lane's own regression test passes only by clock accident:
`tests/integration/evaluator-harvest-rework.test.ts:153` pins
`resolved_at = 2026-08-15T12:00:00Z` against a `new Date()` harvest; I ran the
suite green at 10:17 UTC, and from 12:00Z today onward that fixture inverts and
must fail.

## Verdict — round 1: REWORK — 1 hard blocker (B1) + 1 architecture gap (B2).

- B1: `harvestTerminalRun` returns `ALREADY_HARVESTED` before reading the
  snapshot, and `HARVEST_PIPELINE_VERSION` is a frozen literal, so a settlement
  that arrives after first harvest (i.e. every real external settlement) is
  never projected. Demonstrated on real PostgreSQL: harvest → insert accepted
  external `answer_outcome` → re-harvest yields only CONSENSUS rows.
  `supersedes_observation_id` and lane 02's
  `validate_observation_supersession` trigger are never exercised by any code.
  Contradicts Architecture §1.5, §5.2, §3.4 and the goal packet's "settlement
  outcomes when they exist".
- B2: artifacts with an absent model version are dropped silently — no
  `MODEL_IDENTITY_INCOMPLETE` receipt (Architecture §3.4). Related: STARTED and
  SUCCEEDED receipts are written in one transaction, so no FAILED receipt can
  ever exist (§3.3).

## What I ran myself

- `pnpm run typecheck` → clean.
- `npx vitest run` (full suite) → 86 files / 634 tests passing, incl. the
  FR-0.6 AC5 persisted panel-isolation differential.
- `pnpm run lint` (architecture + source audits) → no violations, nothing
  blocking.
- Independent end-to-end harness on real embedded PostgreSQL 18 (own fixtures,
  full `migrate()`, `globalThis.fetch` replaced by a throwing stub for the whole
  run): rich terminal run (4 model identities incl. a version-less one, authored
  nodes, cross-maker review, reduced judgement, propagation strength, a
  null-run-scoped evaluator tag artifact, a real `question_domain` row); a
  mid-flight run; a settled run with a genuine accepted external
  `answer_outcome` over a real `serve.answer` chain; plus a late-settlement
  scenario and a crash-simulation (receipt deleted) idempotency probe.

Green in my own harness: exact `(model, model_version, domain, step, metric,
truth_basis)` sets; correct actor attribution per step; authoritative
`question_domain` and NULL-domain behaviour; evaluator call-site/attempt
exclusion despite the artifact being null-run-scoped and node-referenced;
version-less identity not merged; zero fetch calls and unchanged `MODEL_CALL`
ledger count during harvest; worker-owned metering projection incl. LOCAL_VLLM
cost 0 vs paid 1.0 cross-unit rule and an UNMETERED call; receipt-based and
natural-key idempotency (0 duplicate inserts); non-terminal run neither
harvested nor receipted, and skipped by the batch reconciler; Q59 table
untouched; observation UPDATE and DELETE both refused.

Red: late-arriving settlement (B1) and missing skip receipt (B2).

Non-blocking findings recorded in the review: exclusion depends solely on
call-site evidence (hardening suggestion), unbounded global metering scan per
single-run harvest, uncapped batch reconciler, version-less calls invisible even
as unmetered, `ON CONFLICT (ledger_entry_id)` narrower than the table's
uniqueness, metric/derivation-version literals, README caveat.

## Round-2 verification (all mine, on real embedded PostgreSQL)

Gates at 2026-08-15 10:17 UTC: typecheck clean; `npx vitest run` 87 files / 639
tests passing (incl. the lane's new rework test and FR-0.6 AC5); both audits
clean. Round-1 green surface re-proven unbroken: exact consensus row set with
correct per-step actor attribution, authoritative/NULL domain, evaluator and
version-less exclusion, zero provider calls, worker metering + cost cells,
re-harvest idempotency, mid-flight run neither harvested nor receipted,
append-only UPDATE/DELETE refusal, Q59 untouched.

Closed: `MODEL_IDENTITY_INCOMPLETE:<artifact>` SKIPPED receipts; durable
STARTED + FAILED receipts (verified with my own injected CHECK constraint, not
the lane's fixture) and clean retry afterwards; forward-dated late settlements
now projected with a correct `supersedes_observation_id` and feedable
consensus/settlement counts for lane 07; batch selector picks up
settlement-only work; batch limit and the `raw_artifact_id` conflict fix landed.

Open: B3 above. Non-blocking additions: blanket `catch {}` in
`reconcileMeteringBestEffort` reporting a synthetic `callsFailed: 1`; a
`NO_NEW_SETTLEMENTS` receipt appended on every re-harvest of a never-settling
run; snapshot now read twice per harvest; consensus vs settlement share
`prowess.outcome.v1` with different value semantics (strength vs binary
outcome) — lane 07 must not average them blindly.

## Constraints honoured

Read-only outside my two output files; no repo file in the worktree touched
(worktree clean, branch local-only, no push); no commits, no board mutations, no
BOUND state, no API-key material handled (DR-179). My verification scripts live
in the session scratchpad, not in the repo. I did not read any other PROG-05
review file; the judgment is formed independently.
