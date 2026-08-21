# PROG-06 peer review — opus2 (second independent reviewer), round 3

Seat: Opus2, substituting the Grok reviewer seat for PROG-06 per V's ruling.
Date: 2026-08-15.
Target: `codex/eval-06-addon` @ `40a7eea` "fix(evaluator): avoid add-on pool deadlock"
(narrow delta `342eefa..40a7eea`, 4 files, +160/-57).
Prior artifacts: `PROG-06-opus2-review-1.md` (PASS, 11 findings),
`PROG-06-opus2-review-2.md` (REWORK, blocker B1).
Judgment formed from scratch; no other PROG-06 review read.

## Verdict: PASS

B1 is closed structurally, not papered over, and my whole verified surface is
intact. One new non-blocking constraint (N5) belongs on the wiring ticket.

## B1 — closed

The fix takes both remedies I named in round 2, together:

1. `pg_try_advisory_lock` replaces the blocking `pg_advisory_lock`
   (`packages/evaluator/src/index.ts:693-700`). Nobody waits, so no invocation
   ever parks a pooled connection while blocked. A same-run loser gets a typed
   `SKIPPED / ADDON_PASS_IN_FLIGHT` and its client is released immediately.
2. The lock-owning `PoolClient` is threaded through `loadCandidate`,
   `recordPipelineEvent` and `insertObservation` (`client ?? this.pool`,
   `client === undefined ? withWriteTransaction(this.pool, insert) : insert(client)`).
   The critical section never asks the pool for a second connection.

The second point is the one that actually removes the deadlock class: there is
no nested checkout anywhere in the add-on's own call graph.

### My round-2 series, re-measured on `40a7eea`

Same harness, same embedded PostgreSQL, same `pool max = 10` (pg default,
`createPool` still does not override it), plus a bare `SELECT 1` recovery probe
after every case.

| shape | round 2 (`342eefa`) | round 3 (`40a7eea`) |
|---|---|---|
| 6 concurrent, same run | 1 call | **72 ms, 1 call**, 1 observation, 1 STARTED, 5 IN_FLIGHT receipts, pool usable |
| 9 concurrent, same run | 82 ms, 1 call | **68 ms, 1 call**, 8 IN_FLIGHT receipts, pool usable |
| 10 concurrent, same run | **never completes** | **74 ms, 1 call**, 9 IN_FLIGHT receipts, pool usable |
| 10 concurrent, ten distinct runs | **never completes** | **73 ms, 10 calls, 10 GRADED**, pool usable |

I pushed past my round-2 series as well: 14 same-run → 69 ms, still exactly one
provider call, one observation, one STARTED, 13 `ADDON_PASS_IN_FLIGHT` receipts;
and 14 and 20 distinct runs → 138 ms / 140 ms, every run graded exactly once,
pool usable after each. A single sequential invocation is unchanged.

So at every width, including twice the pool ceiling: the one-call ceiling holds
per run, distinct runs are not serialised against each other, nothing hangs, and
the pool is immediately usable afterwards.

The semantics change is an improvement, not just a fix — a same-run loser now
returns `ADDON_PASS_IN_FLIGHT` immediately with its own receipt (I confirmed
exactly N−1 receipts at every width) instead of waiting out the winner's model
call to be told `ALREADY_GRADED`.

### Regression tests exceed pool max — confirmed

`tests/integration/evaluator-addon-database.test.ts` now builds a dedicated
`new Pool({ max: 10, connectionTimeoutMillis: 250 })` — pinning the ceiling
explicitly rather than relying on the default — and drives **12** concurrent
invocations, which is `max + 2`, in **both** shapes:

- "keeps twelve same-run invocations above pool max bounded to one provider
  call" — asserts 1 call, 1 GRADED, 11 `ADDON_PASS_IN_FLIGHT`, and 11 persisted
  in-flight receipts;
- "completes twelve distinct-run passes above pool max and leaves the pool
  usable" — asserts 12 GRADED and 12 calls.

Both assert recovery with `pool.query("SELECT 1 AS recovered")` before
`pool.end()`. That is exactly the shape I asked for in round 2, including the
distinct-runs case that fails with no contention at all.

### One detail worth crediting

On unlock failure the client is destroyed via `release(error)` rather than
returned to the pool, with a unit test for it. That matters more than it looks:
advisory locks are re-entrant per session, so a connection carrying a leaked
lock back into the pool would later re-acquire it successfully and silently
defeat the guard. Destroying it is the right call.

## Round-2 verified surface — unbroken

Re-ran my full round-1/2 harness against `40a7eea`: **44/46 pass**, the two
non-passes being the same informational cases as rounds 1 and 2 (F7 exact-string
maker equality, and the by-design caller-bug throw on a non-uuid runId).

- **Blinding** — identity re-planted in `maker`, `provider`, `model_id`,
  `model_version`, `metadata_json` and inside `raw_text`; all 12 negative
  assertions on the captured request envelope still pass.
- **Lineage refusals** — all four DB refusals unchanged
  (`PRODUCER_GRADING_FORBIDDEN`, two × `ADDON_GRADING_LINEAGE_UNRESOLVED`,
  `observation_check2`), and both code-level guards still yield 0 rows.
- **3-call stop** — poisoned run over 6 invocations still makes exactly 3
  provider calls, then `ADDON_RETRY_LIMIT_REACHED`; still 0 HARVEST strikes.
- **Null-run scope** — `runId: null`, `evaluator:addon-attempt:*` subject.
- Hostile-response consistency, append-only guards, sampling, policy receipts,
  harvest ordering: all unchanged.

Gates on `40a7eea`, run by me: `npx tsc --noEmit` exit 0; `pnpm run lint`
`violations: []` / `blocking: []`; `npx vitest run tests/unit tests/architecture
tests/integration` — **85 files / 650 tests pass**.

## New finding

**N5 (non-blocking; belongs to F3, the wiring ticket) — a provider gateway that
shares this pool reintroduces nested checkout.** The lock client is held across
the model call. The real `ProviderGateway` writes its own
`ledger.raw_artifact` / `ledger_entry` evidence (Architecture §2), so if it is
constructed over the *same* pool, each lock holder needs a second connection
during its call. I measured this with a gateway that queries the shared pool
inside `call`: distinct-run concurrency of **8 completes** (185 ms), **14
deadlocks** on the same max-10 pool.

This is **not** a defect in the delivered code — the gateway is an injected
dependency, the add-on has no production caller (F3, open since round 1), and
the add-on's own call graph is now free of nested checkout at 20× concurrency.
But it is a hard constraint on whoever wires the selector, and it would become a
blocker the moment a caller lands that shares one pool at concurrency ≥ max−1.
Options, in order of robustness: give the provider gateway its own pool; or hold
the lock only for the candidate check + STARTED insert, release the client
before the model call, and re-acquire for the insert (the `ALREADY_GRADED` check
and the observation unique key already dedupe, and the STARTED-based ceiling
already bounds the small duplicate window); or cap concurrent add-on passes
below `poolMax − 1`.

## Findings ledger at `40a7eea`

| # | Finding | Status |
|---|---|---|
| B1 | `withRunLock` pool self-deadlock | **Closed** — measured at 6/9/10/14 same-run and 10/14/20 distinct-run |
| F1 | no concurrency lock | **Closed** — 1 call per run at every width |
| F2 | 0026 vs Architecture §3.4 | Escalated in the lane self-report; awaits Hermes ratification |
| F3 | no production caller/selector | Open — now carries N5 as a design constraint |
| F4 | preflight receipts | Closed (round 2) |
| F5 | STARTED escapes typed contract | Closed (round 2) |
| F6 | uncapped grader `reasons` | Open, unchanged |
| F7 | exact-string maker equality | Open, informational (matches merged 0019) |
| F8 | "different lineage" is a maker-string guard | Open, informational (lane-02 owned) |
| F9 | dead constant | Closed (round 2) |
| F10 | identity guesses stored verbatim | Open, informational |
| F11 | `ALREADY_GRADED` ignores `derivation_version` | Open, low |
| N1–N4 | round-2 notes | Unchanged; N3 (mutable `inputHash` capture) and N4 (indentation) still stand |

Nothing on that list blocks the merge. F2 needs a Hermes ruling, and F3+N5 need
to travel together to whoever wires the pass.
