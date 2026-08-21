# PROG-06 peer review — opus2 (second independent reviewer), round 2

Seat: Opus2, substituting the Grok reviewer seat for PROG-06 per V's ruling.
Date: 2026-08-15.
Target: `codex/eval-06-addon` @ `342eefa` "fix(evaluator): preserve add-on attempt budget"
(delta `ebdff73..342eefa`, 5 files, +346/-45).
Round-1 artifact: `PROG-06-opus2-review-1.md` (verdict PASS with 11 findings).
Judgment formed from scratch; no other PROG-06 review read.

## Verdict: REWORK

One blocker, introduced by this commit. Everything else in the delta is a real
improvement and my entire round-1 green surface survives the preflight
reordering intact. The rework is narrow: the advisory-lock guard is correct in
intent and correct in behaviour below the connection-pool ceiling, but as
written it can permanently wedge the evaluator's shared `pg` pool. It trades a
bounded over-spend for an unrecoverable liveness failure.

---

## BLOCKER B1 — `withRunLock` self-deadlocks the connection pool

`PostgresEvaluatorAddonRepository.withRunLock` (`packages/evaluator/src/index.ts:683-701`)
checks a client out of the pool, takes a session-level `pg_advisory_lock`, and
holds both for the whole critical section. But every operation *inside* that
section — `loadCandidate`, `recordPipelineEvent`, `insertObservation` — asks the
**same pool** for another connection (`this.pool.query`, `withWriteTransaction(this.pool, …)`).

`createPool` is `new PgPool({ connectionString })` (`packages/db/src/index.ts:66`):
pg's default `max` is 10 and `connectionTimeoutMillis` is unset (wait forever).
`pg_advisory_lock` also has no timeout. So once 10 add-on invocations are in
flight in one process, all ten pooled connections are held by `withRunLock` and
every one of them is waiting for an eleventh that can never exist.

Measured on real embedded PostgreSQL (`pool max = 10`):

| concurrency | shape | result |
|---|---|---|
| 6, same run | round-1 repro | **1 provider call**, 1 observation, 1 STARTED — F1 fixed |
| 9, same run | just under the ceiling | completes in 82 ms, 1 provider call |
| 10, same run | at the ceiling | **never completes** (45 s timeout), 0 provider calls |
| 10, **ten different runs** | zero lock contention | **never completes**, 0 provider calls |

The last row is the damning one. Ten distinct runs contend for nothing — every
advisory lock is granted instantly — and the pass still deadlocks, purely on
connection starvation. And it does not recover: after the wedge I could not even
seed a fixture, because a plain `pool.query` on that pool never returned either.
A wedged pool starves every other consumer sharing it (harvest, tagger,
metering reconciliation), not just the add-on.

Ten is not an exotic number. It is pg's default `max`, the repo does not
override it, and the sibling batch reconciler `reconcileEvaluatorTerminalRuns`
defaults to `limit: 100`. Any future selector that grades runs concurrently —
the natural way to wire F3 — lands on this immediately.

The lane's own new test ("serializes six concurrent invocations to one shared
provider call") cannot catch it: width 6 is under the ceiling.

Contrast the precedent this was modelled on. Harvest takes
`pg_advisory_xact_lock` **inside** `withWriteTransaction`
(`packages/evaluator/src/index.ts:1789,1803`) — the lock lives on the single
client that also performs the work, so there is no nested checkout and the lock
releases at commit. The rework took the lock on a *second* connection and kept
using the pool underneath it.

Note also that even below the ceiling the lock and its connection are held
across the provider HTTP call (`deadlineMs × maxAttempts`), so each in-flight
add-on parks a pooled connection for the duration of a model call.

**Remedies** (either of the first two closes it; the third is only mitigation):

1. Use `pg_try_advisory_lock` and, when it is not granted, return a typed
   `SKIPPED` (e.g. `ADDON_PASS_IN_FLIGHT`). Nothing ever blocks, no waiter parks
   a connection, and "another pass is already running for this run" is the
   semantically right answer for a one-bounded-pass design.
2. Thread the locked `PoolClient` through `loadCandidate` / `recordPipelineEvent`
   / `insertObservation` so the critical section never asks the pool for a
   second connection.
3. Defensive only: set `connectionTimeoutMillis` on the pool and a
   `SET LOCAL lock_timeout`, so the failure becomes bounded and typed instead of
   permanent. This does not remove the starvation, only names it.

Whichever path is taken, the regression test must exceed the pool ceiling —
at least `max + 1` concurrent invocations, and ideally the distinct-runs shape,
which fails even with no contention at all.

---

## Round-1 green surface — re-verified, unbroken

The preflight reordering (isolation assert hoisted above the lock, policy
validation moved after the receipt closure, STARTED moved inside the `try`)
did not disturb anything I verified in round 1. I re-ran my full round-1
harness against `342eefa` on a fresh embedded PostgreSQL: **44/46 pass**, and
the two non-passes are the same two informational cases as round 1 (F7
case-variant maker, and the by-design caller-bug throw for a non-uuid runId).

- **Blinding envelope** — identity re-planted in `maker`, `provider`,
  `model_id`, `model_version`, `metadata_json` and inside `raw_text`; all 12
  negative assertions on the captured request envelope still pass. Nothing
  nested, nothing JSON-encoded.
- **Lineage guard, DB** — all four refusals unchanged: same-maker →
  `PRODUCER_GRADING_FORBIDDEN`; run-scoped grader and cross-run graded artifact
  → `ADDON_GRADING_LINEAGE_UNRESOLVED`; grader refs under a non-add-on
  `source_kind` → `observation_check2`.
- **Lineage guard, code** — lying gateway → `FAILED/ADDON_EXECUTION_FAILED`,
  0 rows; gateway reporting the judge's maker → `SKIPPED`, 0 rows.
- **Poisoned run** — still exactly 3 provider calls across 6 invocations, then
  `ADDON_RETRY_LIMIT_REACHED`; still 0 HARVEST strikes consumed.
- **Hostile responses** — non-JSON, `score: 7`, `NaN`, extra keys, empty
  reasons, NUL byte, SQL text: all still leave the store consistent.
- **Null-run scope** — `runId: null`, `evaluator:addon-attempt:*` subject,
  unchanged.
- **Append-only** — UPDATE/DELETE still refused on both evaluator tables.

Repository gates on `342eefa`, run by me: `npx tsc --noEmit` exit 0;
`pnpm run lint` (orphan-audit architecture + source) `violations: []`,
`blocking: []`; `npx vitest run tests/unit tests/architecture` plus the three
evaluator integration files — **77 files / 563 tests pass**, including the
lane's five new add-on integration cases.

## Round-1 findings — status at `342eefa`

| # | Round-1 finding | Status |
|---|---|---|
| F1 | no concurrency lock; 6 concurrent → 6 calls | **Fixed in intent** (6 → 1 call verified) but the fix introduces B1 |
| F2 | 0026 contradicts Architecture §3.4 | **Escalated, verified.** The lane self-report now carries a dedicated "Architecture amendment request — Hermes stage verdict required" section asking Hermes to ratify 0026 and amend §3.4/§5.3, and lists it as an open decision. No longer silent. |
| F3 | no production caller/selector | Unchanged — and B1 makes the wiring decision more consequential |
| F4 | no receipt for invalid policy / preflight failure | **Fixed.** Preflight receipts are written (measured `addon_receipts=1`), and the family/register mismatch is now a recoverable typed `SKIPPED / ADDON_FAMILY_REGISTER_VERSION_MISMATCH` instead of a terminal FAILED |
| F5 | STARTED receipt escapes the typed contract | **Fixed.** Verified: a failing receipt store now yields `FAILED / ADDON_PREFLIGHT_FAILED` instead of throwing |
| F6 | uncapped grader `reasons` (1.33 MB row) | Unchanged |
| F7 | maker equality is exact-string | Unchanged (same as merged 0019) |
| F8 | "different lineage" is a maker-string guard | Unchanged (lane-02 owned) |
| F9 | `ADDON_MAX_PROVIDER_CALLS` unused | **Fixed** (removed) |
| F10 | identity guesses stored verbatim in `reasons` | Unchanged |
| F11 | `ALREADY_GRADED` ignores `derivation_version` | Unchanged |

## New round-2 observations (non-blocking)

**N1 — isolation assert relocation is sound.** It now runs before the lock and
before `loadCandidate`, and records a `SKIPPED` receipt rather than the round-1
mismatch (FAILED receipt, SKIPPED return). It is still before any model call, so
goal-packet constraint 4 holds, and a deployment fault no longer burns a
lifetime attempt. Verified by my own fixture as well as the lane's tests.

**N2 — behaviour change for callers.** A run id that resolves to no `core.run`
row now throws `EVALUATOR_ADDON_RUN_UNRESOLVED` where it previously returned
`FAILED / ADDON_PREFLIGHT_FAILED`. Consistent with the blank-runId contract
(caller bug → throw), but it is a contract change any future selector must
handle.

**N3 — `inputHash` is now a mutable `let` captured by the receipt closure** and
reassigned inside the lock. Correct as written (pre-lock receipts legitimately
carry the candidate-less hash), but the mutable capture across a lock boundary
is fragile; passing the hash explicitly would be sturdier.

**N4 — cosmetic.** The `withRunLock` callback body is not re-indented, so the
whole critical section sits at the pre-rework indentation level.

## What round 3 needs

Only B1. Close it with `pg_try_advisory_lock` + a typed in-flight skip, or by
threading the locked client through the repository calls; add a regression test
at `pool max + 1` concurrency (and, ideally, the distinct-runs shape). My
round-1 surface and the F2 escalation need no further attention.
