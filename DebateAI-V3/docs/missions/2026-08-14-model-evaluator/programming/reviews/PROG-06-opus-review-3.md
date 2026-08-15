# PROG-06 — Opus reviewer A, round 3 (narrow delta)

Lane: `codex/eval-06-addon`, fix commit `40a7eea` ("fix(evaluator): avoid add-on pool deadlock")
Delta reviewed: `git diff 342eefa..40a7eea` — 4 files (evaluator source, README, both add-on test files)
Full branch vs base: `dev...codex/eval-06-addon` — 6 files, +1474 / -0
Reviewer: Opus A (read-only outside my two output files; no commits; no other review files read)

## Verdict

**PASS.**

My round-2 blocker is fixed, and fixed properly rather than papered over. I
re-ran my own standalone probe at and above the cliff in both variants: every
scenario that deadlocked in round 2 now completes, with the one-pass-per-run
ceiling intact and the pool left usable. The regression test now pins `max: 10`
and runs 12 — above the cliff, where round 2's test sat four below it. The
unlock-throw path provably cannot return a lock-holding client to the pool. No
collateral anywhere on the surface that passed in round 2.

## The fix

`withRunLock` changed shape in three ways, all of them the right ones:

1. **`pg_advisory_lock` → `pg_try_advisory_lock`.** Non-blocking. Losers return
   `{ acquired: false }`, release the client immediately, and the caller records
   a typed `SKIPPED / ADDON_PASS_IN_FLIGHT` receipt.
2. **The winner does all repository work on the lock-owning client.**
   `withRunLock` passes its client into the callback, and `loadCandidate`,
   `recordPipelineEvent`, and `insertObservation` all gained an optional
   `client?: PoolClient` that overrides `this.pool`. The critical section now
   needs exactly **one** connection instead of two, which is what removes the
   starvation.
3. **Unlock failure destroys the connection.** The unlock result is checked
   (`pg_advisory_unlock` returning anything but `true` throws), and the catch
   calls `client.release(error)` — node-postgres's destroy signal — before
   rethrowing.

This is option 1 plus option 2 from my round-2 note, taken together. Combining
them is better than either alone: try-lock alone would still have needed a second
client, and same-client alone would still have queued blocked waiters.

## Probe results — my own, re-run against `40a7eea`

Same standalone probe as round 2 (outside the repo, importing the real
`PostgresEvaluatorAddonRepository`, real embedded Postgres, pool built exactly as
`createPool` does with no `max` so the cap is pg's default 10):

| scenario | n | round 2 | round 3 | winners | pool after |
| --- | --- | --- | --- | --- | --- |
| same-run, at cliff | 10 | TIMEOUT 0/10 | **COMPLETED** | 1 | usable |
| same-run, above cliff | 12 | TIMEOUT 0/12 | **COMPLETED** | 1 | usable |
| distinct-run, at cliff | 10 | — | **COMPLETED** | 10 | usable |
| distinct-run, above cliff | 12 | TIMEOUT 0/12 | **COMPLETED** | 12 | usable |
| distinct-run, 3× pool max | 30 | — | **COMPLETED** | 30 | usable |

**Ceiling intact:** in both same-run runs exactly **one** invocation acquired the
lock and exactly one callback body executed (`workRan=1`), so contended sweeps
still yield exactly one provider pass per run. The distinct-run rows correctly
show every invocation winning its own key — the lock serializes per run and does
not falsely serialize unrelated runs. Every scenario left the pool answering
`SELECT 1`.

**Unlock-throw eviction, verified independently of the unit test:** I checked out
a client from a real pool and called `release(new Error(...))`. Pool
`totalCount` went `1 → 0` — the connection is destroyed, not returned. So the
mechanism the fix relies on to prevent a lock-holding client from re-entering the
pool actually does what the code assumes. The accompanying unit test ("destroys
the checked-out client when advisory unlock throws") asserts `release` was called
exactly once and with the error, which is the correct assertion for that
behavior.

## Regression test now exceeds pool max — confirmed

Round 2's test ran 6 concurrent on the shared test pool, four below the cliff.
The replacements build their **own** pool with `max: 10` explicitly pinned and
`connectionTimeoutMillis: 250`, then run **12**:

- "keeps twelve same-run invocations above pool max bounded to one provider call"
  — asserts 1 `GRADED`, 11 `ADDON_PASS_IN_FLIGHT`, `gateway.call` exactly once,
  11 persisted `ADDON_PASS_IN_FLIGHT` receipts, and `pool.query("SELECT 1")`
  succeeding afterward.
- "completes twelve distinct-run passes above pool max and leaves the pool
  usable" — 12 runs, 12 `GRADED`, 12 gateway calls, pool still usable.

Pinning `max` rather than relying on the default is the right call: the test now
states the invariant it is testing instead of inheriting it. The 250 ms
connection timeout means a regression fails fast instead of hanging the suite —
worth noting, because a deadlock regression that hangs CI is nearly as bad as the
bug.

## Verification I ran myself on `40a7eea`

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx vitest run tests/unit tests/architecture` | 74 files / **527** passed (+1: unlock-throw test) |
| `npx vitest run tests/integration` | 11 files / **123** passed |
| `evaluator-addon-database.test.ts` | **8/8** passed |
| FR-0.6 AC5 differential, by name | PASS |
| orphan audit — source | `{"blocking": []}` |
| orphan audit — architecture | 27 edge rows, `violations: []` |
| DR-179 key scan, full `dev...HEAD` | 0 hits |
| `BOUND` scan, full `dev...HEAD` | 5 hits, all lowercase `bound`; no dispatch `BOUND` state |

## Collateral check on the round-2-passed surface

Nothing regressed. B1's SQL-ceiling test, B2's isolation-fault test, and B3's
preflight-receipt test all still pass unchanged — and they are not incidentally
passing, since the client-threading change touched every `recordPipelineEvent`
call site they assert against. Blinding, null-run scope, the DB maker guard, and
FR-0.6 AC5 are untouched by this delta and verified green again. B4's escalation
text in the self-report is unchanged and still stands.

One thing I checked specifically because the diff changes it silently: passing a
client makes `recordPipelineEvent` and `insertObservation` bypass
`withWriteTransaction`, so those writes now run in **autocommit** rather than
inside `BEGIN`/`COMMIT`. This is not sloppiness — it is required. Wrapping the
locked section in `withWriteTransaction` would set the `writeTransaction`
AsyncLocalStorage flag, and `assertNoOpenWriteTransaction` would then reject the
provider call with `PROVIDER_CALL_INSIDE_TRANSACTION`. The consequence is that
`allocateSequence` and the following INSERT are no longer atomic, so a failed
insert can burn a sequence number. That is harmless: `at_seq` is `UNIQUE` with no
contiguity requirement, and I confirmed `ledger.allocate_sequence()` is a single
atomic SQL function call, so there is no read-modify-write race from losing
transaction scope. Worth a sentence in the README; not worth blocking.

## Residual non-blocking items

New in this delta:

1. The unlock-failure `throw` lives in the `finally` block, so it replaces
   whatever the `try` produced. If `work()` already failed, its error is masked
   by the unlock error and the real reason is lost. Consider capturing and
   rethrowing the original with the unlock failure attached.
2. If `client.release()` in the success branch ever threw, the catch would call
   `release(error)` on the same client — node-postgres rejects a double release.
   Unreachable in practice; a `released` flag would close it.
3. `ADDON_PASS_IN_FLIGHT` losers no longer wait for the winner (round 2 they
   observed `ALREADY_GRADED`). This is the better behavior — no attempt consumed,
   run stays eligible for a later sweep — but it does write one receipt per
   loser, so a heavily contended sweep leaves 11 skip rows. Fine; just don't let
   ticket 07 mistake receipt volume for signal.
4. The autocommit note above.

Carried forward, unchanged: O(N) run-ordinal count per invocation; `questionExcerpt`
/ `taskExcerpt` unbounded in length; no test for the
`ADDON_GRADING_LINEAGE_UNRESOLVED` rejection arm; best-effort receipt writes can
silently lose a `SUCCEEDED` row; and the optional second isolation assert at the
gateway boundary to match the tagger's shape.

None of these block. Architecture §3.4/§5.3 ratification of migration 0026
remains Hermes's open decision, correctly escalated by the lane.

## Closing

Three rounds, and each one closed what it was asked to close without breaking
what came before. Round 3 is the cleanest of them: the fix addresses the
mechanism rather than the symptom, the new test is calibrated above the failure
threshold instead of below it, and the one behavior it silently changed
(autocommit writes) turns out to be forced by an existing invariant rather than
overlooked. I am satisfied that the branch is sound.
