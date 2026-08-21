# PROG-06 — Opus reviewer A, round 2

Lane: `codex/eval-06-addon` (Codex), rework commit `342eefa`
("fix(evaluator): preserve add-on attempt budget"), on top of `ebdff73`
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon`
Rework diff: `git diff ebdff73..342eefa` — 5 files, +346 / -45
Reviewer: Opus A (read-only outside my two output files; no commits; no other review files read)

## Verdict

**REWORK** — one blocker, and it is not one of mine.

**All four of my round-1 blockers (B1–B4) are genuinely resolved.** I re-ran
everything and specifically exercised the real SQL ceiling and the config-fault
path as instructed; both now do what the lane claims. The rework is honest work.

But the rework also introduced an **advisory lock that deadlocks the evaluator
worker's connection pool**, permanently and unrecoverably, at a concurrency level
just above the one the new test happens to use. I demonstrated it empirically
rather than inferring it. Details in the blocker section.

## Verification I ran myself on `342eefa`

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx vitest run tests/unit tests/architecture` | 74 files / **526** tests passed (+1 vs round 1) |
| `npx vitest run tests/integration` | 11 files / **122** tests passed (+4 vs round 1) |
| `npx vitest run tests/integration/evaluator-addon-database.test.ts` | 7/7 passed, incl. all four new cases |
| FR-0.6 AC5 differential, by name | PASS |
| `tools/orphan-audit` source | `{"blocking": []}` |
| DR-179 / BOUND scan on full `dev...HEAD` diff | 7 hits, all `bound` / `CallBound` / `boundary`; no key material, no dispatch `BOUND` state |

## B1 — SQL-backed retry ceiling — **RESOLVED**

The vacuous `expect(ADDON_MAX_RUN_ATTEMPTS).toBe(3)` is deleted. The replacement,
"enforces the SQL-backed cross-invocation ceiling after three real failed
passes", is the real thing: it seeds a gradable run on live embedded Postgres,
throws from the gateway, drives **four** invocations through the real worker and
the real `PostgresEvaluatorAddonRepository`, and asserts

- results 1–3 are `FAILED / ADDON_PROVIDER_FAILED`, result 4 is
  `SKIPPED / ADDON_RETRY_LIMIT_REACHED`;
- `gateway.call` was invoked exactly **3** times — the ceiling actually
  suppressed the fourth model call;
- a direct `new PostgresEvaluatorAddonRepository(pool).loadCandidate(runId)`
  returns `"RETRY_LIMIT_REACHED"`; and
- `count(DISTINCT attempt_id)` over ADDON `STARTED` receipts is exactly `"3"`.

That last pair is what makes it non-vacuous: it queries the ledger the ceiling
reads, not a stub. Mandatory constraint 1 is now bounded *and* tested.

## B2 — Attempt budget vs. config faults — **RESOLVED**

`assertEvaluatorProviderIsolation` now runs as a preflight *before*
`withRunLock`, before `loadCandidate`, and before any `STARTED` receipt
(`packages/evaluator/src/index.ts:499-506`). The FAILED-recorded/SKIPPED-returned
inconsistency I flagged is gone — it is `SKIPPED` on both sides now, and a new
unit test pins that classification.

The integration test "does not burn run attempts during a deployment isolation
fault" reproduces my exact scenario: three sweeps under a misconfigured
`configuredProviderSet`, asserting the ADDON receipt log contains exactly three
`SKIPPED / ADDON_PROVIDER_ISOLATION_FAILED` rows **and no `STARTED`**, then a
fourth invocation with a corrected deployment reaching `GRADED` with one model
call. Recovery after the config fix is proven, which was the heart of B2.

One note, non-blocking: the assert has moved from "immediately before the model
call" (the tagger pattern named in constraint 4) to a single early preflight.
Constraint 4 is still satisfied — it is before the model call, on inputs that are
parameters of the same call — but there are now several `await` points between
the assert and the call. Since `family` and `deployment` are caller-owned
objects, a second assert at the gateway boundary would cost nothing and restore
the tagger's shape exactly. Worth doing, not worth blocking.

## B3 — Preflight receipts — **RESOLVED**

Every preflight terminal path now writes a typed receipt:

- invalid/absent `register_version` → `FAILED / ADDON_PREFLIGHT_FAILED`;
- family/run register mismatch → `SKIPPED / ADDON_FAMILY_REGISTER_VERSION_MISMATCH`
  (new reason, and correctly reclassified from FAILED to a **recoverable** skip);
- policy read throws → `SKIPPED / ADDON_POLICY_INVALID`;
- `ADDON_POLICY_INVALID` inside the package now records a receipt too.

The integration test asserts the persisted receipt rows for both the
invalid-policy and version-mismatch cases *and* proves recovery by re-invoking
with the matching family and reaching `GRADED`.

I also want to credit a detail the lane got right that I did not ask for: a
missing `core.run` row now throws `EVALUATOR_ADDON_RUN_UNRESOLVED` instead of
attempting a receipt. That is correct, because `evaluator.pipeline_event.run_id`
carries an FK to `core.run` — a receipt for a nonexistent run is impossible, so
throwing is the only honest option. Good reasoning.

## B4 — Architecture §3.4 escalation — **RESOLVED**

The self-report now carries an explicit section, "Architecture amendment request
— Hermes stage verdict required", stating the precondition change from
`grader_run = NEW.run_id` to `grader_run IS NULL`, its justification under the
null-run gateway law, the two protections retained, and a direct request that
Hermes ratify migration 0026 and amend the binding §3.4 (and §5.3) wording. The
open-questions line I called out is corrected: "open decision: Hermes
ratification of the Architecture §3.4/§5.3 null-run grader amendment." This is
now an escalation rather than a silent deviation, which is exactly what B4 asked
for. The doc amendment itself remains Hermes's to make.

## Round-1 non-blocking items

Fixed: dead `ADDON_MAX_PROVIDER_CALLS` removed; the unwrapped `STARTED` receipt
call is now wrapped and degrades to `FAILED / ADDON_PREFLIGHT_FAILED`. Items 3–6
(O(N) run ordinal, unbounded excerpt lengths, untested
`ADDON_GRADING_LINEAGE_UNRESOLVED` arm, best-effort receipt loss) are unchanged
and remain non-blocking.

---

## New blocker — `withRunLock` deadlocks the connection pool

`PostgresEvaluatorAddonRepository.withRunLock`
(`packages/evaluator/src/index.ts:683-701`) checks a client out of the pool,
takes a **session-level** `pg_advisory_lock` on it, and holds that client for the
entire critical section — which includes `loadCandidate`, the receipt writes, and
the provider call. The callback then issues its queries through `this.pool`,
i.e. it needs **a second client** from the same pool.

`packages/db/src/index.ts:66` constructs `new PgPool({ connectionString })` with
no `max`, so the pool caps at pg's default of **10**. Once 10 invocations are
concurrently inside `withRunLock`, all 10 clients are held by lock sessions and
no client remains for any holder's `work()` queries. Nothing ever completes and
nothing ever times out.

I verified this rather than asserting it, with a standalone probe outside the
repo that imports the real `PostgresEvaluatorAddonRepository` against a real
embedded Postgres:

| concurrency | outcome |
| --- | --- |
| 6 (the value the new test uses) | COMPLETED 6/6 |
| 9 | COMPLETED 9/9 |
| **10** (= pool max) | **TIMEOUT, 0/10 completed** |
| **12** | **TIMEOUT, 0/12 completed** |

The threshold sits exactly at the pool max, and the new concurrency test picks 6
— four below the cliff.

**It is worse than same-run contention.** I re-ran the 12-way probe with a
*distinct* lock key per invocation, so no invocation ever waits on another's
lock: still `TIMEOUT, 0/12`. Every invocation acquires its own lock instantly and
then starves waiting for a second client. So this is not a lock-contention bug
that only bites when two workers race the same run — it is plain pool exhaustion
that bites whenever ~10 add-on passes are in flight at once, on any runs. And
because the pool is shared, a wedged pool takes the rest of the evaluator worker
(harvest, metering, tagger) down with it, not just the add-on.

No product-run path is touched, and there is no production caller wiring the
add-on yet, so nothing is broken in the field today. But the lock exists
precisely to make concurrency safe, and as written it converts a benign race into
a permanent hang the moment a scheduler fans out.

**Required — any one of:**

1. run the locked work on the **same** client the lock was taken on (pass the
   client into the callback), so the critical section needs exactly one
   connection; or
2. use `pg_try_advisory_lock` and return a typed skip when it is not acquired —
   the `ALREADY_GRADED` guard already makes losing the race safe and this is the
   smallest change; or
3. use a transaction-scoped `pg_advisory_xact_lock` inside
   `withWriteTransaction` (the pattern `packages/db` already uses for the
   migration lock).

Whichever is chosen, please raise the concurrency test above the pool max (or
pin `max` explicitly and test at `max + 2`), so the test would actually fail if
this regressed.

Secondary, same site: if `pg_advisory_unlock` ever throws, the inner `finally`
still releases the client to the pool with a session lock still held on that
connection, which would block that run key for the life of the process. Options 1
and 3 above make this unreachable.

## Closing

Round 1's four blockers were addressed properly — the ceiling test is now real,
the config-fault path provably does not consume budget and provably recovers, the
receipts exist and are typed, and the architecture change is escalated rather
than smuggled. That is a clean rework. The one thing standing between this branch
and a PASS is a concurrency guard that was added on top and tested just under the
level where it breaks.
