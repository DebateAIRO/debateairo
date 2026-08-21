# Opus reviewer A — PROG-06 / eval-06-addon

## Round 3 (current) — commit `40a7eea`

**REVIEW VERDICT: PASS.**

Review written to
`DebateAI-V3/docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-06-opus-review-3.md`.
Narrow delta reviewed: `git diff 342eefa..40a7eea` (4 files). Read-only outside
my two output files; no commits; no other review files read.

### My round-2 blocker (pool deadlock) — RESOLVED

The fix combines both remedies I offered: `pg_try_advisory_lock` (non-blocking;
losers skip with a typed `ADDON_PASS_IN_FLIGHT` receipt) **and** threading the
lock-owning client through `loadCandidate` / `recordPipelineEvent` /
`insertObservation`, so the critical section needs one connection instead of two.
Unlock failure is checked and the client destroyed via `release(error)`.

I re-ran my own standalone probe against the fixed class, same pool construction
as `createPool` (default max 10):

| scenario | n | round 2 | round 3 | winners | pool after |
| --- | --- | --- | --- | --- | --- |
| same-run, at cliff | 10 | TIMEOUT 0/10 | COMPLETED | 1 | usable |
| same-run, above cliff | 12 | TIMEOUT 0/12 | COMPLETED | 1 | usable |
| distinct-run, at cliff | 10 | — | COMPLETED | 10 | usable |
| distinct-run, above cliff | 12 | TIMEOUT 0/12 | COMPLETED | 12 | usable |
| distinct-run, 3× pool max | 30 | — | COMPLETED | 30 | usable |

Ceiling intact: both same-run runs had exactly one winner and one callback
execution, so a contended sweep still yields one provider pass per run; distinct
runs correctly all win their own key. Separately verified the eviction mechanism
itself — `release(new Error(...))` on a real pool drops `totalCount` 1 → 0, so a
lock-holding client cannot re-enter the pool.

### Regression test now exceeds pool max — confirmed

Replacements pin their own `new Pool({ max: 10, connectionTimeoutMillis: 250 })`
and run **12** (round 2 ran 6, four below the cliff): same-run asserts 1 `GRADED`
+ 11 `ADDON_PASS_IN_FLIGHT` + 11 persisted receipts + one gateway call + pool
still usable; distinct-run asserts 12 `GRADED` / 12 calls. The 250 ms connect
timeout makes a regression fail fast rather than hang CI.

### Verification I ran myself

typecheck exit 0; unit+architecture **527** passed; integration **123** passed;
add-on file **8/8**; FR-0.6 AC5 green by name; orphan audits clean (source
`blocking: []`, architecture 27 edges / 0 violations); 0 API-key hits; no
dispatch `BOUND` (5 hits, all lowercase `bound`).

### No collateral

B1/B2/B3 tests still pass and are not incidentally passing — the client-threading
change touched every `recordPipelineEvent` call site they assert against.
Blinding, null-run scope, DB maker guard untouched. B4 escalation text unchanged
and still stands.

Checked one silent change: passing a client bypasses `withWriteTransaction`, so
locked-path writes are autocommit. This is **required**, not sloppy — wrapping
the section would set the `writeTransaction` ALS flag and
`assertNoOpenWriteTransaction` would reject the provider call with
`PROVIDER_CALL_INSIDE_TRANSACTION`. Harmless: `at_seq` permits gaps and
`ledger.allocate_sequence()` is a single atomic call, so no lost-update race.

### Residual, all non-blocking

Unlock `throw` inside `finally` masks any in-flight `work()` error; theoretical
double-release if `release()` itself threw; `ADDON_PASS_IN_FLIGHT` adds one
receipt per loser; autocommit worth a README line. Carried forward: O(N) run
ordinal, unbounded excerpt lengths, untested `ADDON_GRADING_LINEAGE_UNRESOLVED`
arm, best-effort receipt loss, optional second isolation assert at the gateway
boundary. Architecture §3.4/§5.3 ratification of migration 0026 remains Hermes's
open decision, correctly escalated.

## Round 2 — commit `342eefa`

REWORK. My four round-1 blockers all genuinely resolved (real SQL-ceiling test on
live Postgres; isolation preflight ahead of any `STARTED` with proven recovery;
typed receipts for every preflight path; §3.4 amendment escalated). One new
blocker: `withRunLock` deadlocked the shared pg pool at concurrency ≥ pool max,
proven by probe (10 → 0/10, 12 → 0/12), including with distinct lock keys, so it
was pool exhaustion rather than lock contention. Review at
`…/programming/reviews/PROG-06-opus-review-2.md`.

## Round 1 — commit `ebdff73`

REWORK. Four blockers: vacuous retry-ceiling test; config fault burning the
lifetime attempt budget; silent preflight paths with no receipts; unescalated
Architecture §3.4 trigger amendment. Review at
`…/programming/reviews/PROG-06-opus-review-1.md`.

Deliverables, blinding, null-run scope, DB maker guard, FR-0.6 AC5, DR-179, and
no-BOUND stayed green across all three rounds.
