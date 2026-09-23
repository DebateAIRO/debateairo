# Review packet — run content lease: shared for users, exclusive for erasure

You are an independent, adversarial reviewer. **Read-only: do not modify, create, stage or commit any file.**
Working tree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` (branch `integration/debate-tiers`, uncommitted).

## The defect (measured live, 2026-09-13)
`acquireRunContentLease` (`packages/db/src/index.ts`) took `debateai:run-content-lease:v1:<runId>` with an
EXCLUSIVE `pg_try_advisory_lock` and a 10 ms retry with no deadline. The runner wraps a whole debate in that lease
(`apps/runner/src/index.ts` ~1277, `withDisclosureContentLease([claimedRunId], …)`). Every API reader of the same run
(debate page `GET /v1/runs/:id`, its `/events`, the home list, a new ask's memory reads) therefore spun until the debate
ended. A Premium debate with a ~2.5 min/call Grok maker held it for 30+ minutes; the UI proxy returned 502 after 300 s.
Measured: Postgres showed the runner session holding the run key; API at ~19 % CPU; ~232 xact/s of retry churn.

## The change (see `docs/missions/run-content-lease-sharing/logs/change.diff`)
1. `acquireRunContentLease`: `pg_try_advisory_lock` → `pg_try_advisory_lock_shared`; its unlock
   `pg_advisory_unlock` → `pg_advisory_unlock_shared`. Retry loop unchanged.
2. `packages/db/src/account-erasure.ts` `withErasureContentLeases` is UNCHANGED: blocking EXCLUSIVE
   `pg_advisory_lock` / `pg_advisory_unlock` on the same namespace — the only exclusive holder.
3. New `tests/integration/run-content-lease-sharing.test.ts` (embedded Postgres): reader acquires while runner holds;
   erasure excluded while any user holds; users excluded while erasure holds; newcomers cannot jump a waiting erasure;
   shared release leaves the key free.
4. `tests/architecture/s6-content-encryption-contract.test.ts`: pin moved to the shared SQL; new pin that erasure stays
   exclusive and never `_shared`.

Postgres semantics were also verified on a throwaway key: shared+shared coexist; exclusive try fails while shared held;
blocking exclusive waits for ALL shared; a new `pg_try_advisory_lock_shared` returns false while an exclusive request is
queued (no starvation); exclusive unlock of a shared hold returns false.

## What you must decide (measure, don't argue)
A. **Erasure safety.** Is there ANY path where account erasure can shred/delete a run's keys or content while a user of
   that run still holds the lease, or where a user can read after erasure started? Include `assertLive()` (it checks
   `core.run_private_content_is_live`) and the nested/borrowed lease paths (`withRunContentLease` scope reuse, the second
   acquire at ~`packages/db/src/index.ts:450`).
B. **Hidden reliance on user-vs-user exclusion.** Previously two USERS of the same run were serialized. Enumerate the
   callers (`grep -rn "withRunContentLease\|acquireRunContentLease\|withDisclosureContentLease" apps packages`) and find
   any writer whose correctness depended on that: run key provisioning (`prepareLeasedContentEncryptionForRun`,
   `core.lock_run_key_provision_for_commit`), ledger appends, evaluator harvest vs. a still-running run, memory/serve
   disclosure writes, liveness writes, critique. For each concern, cite the code that makes it safe or unsafe.
C. **Lock bookkeeping.** Shared/exclusive unlock pairing everywhere the namespace is locked; session reuse after release;
   `pg_advisory_unlock_all` or connection reset paths; a pool returning a connection that still holds a shared lock.
D. **Anything else** that makes this change wrong or incomplete (other exclusive lockers of the key, SQL functions,
   migrations `0040_account_erasure.sql`, the S10 erasure runbook's stated lock order).

You may run: `pnpm exec vitest run tests/integration/run-content-lease-sharing.test.ts`,
`pnpm exec vitest run tests/architecture/s6-content-encryption-contract.test.ts`, and read anything.
Do NOT touch the live dev database on 127.0.0.1:55432 or any `.local/**` file.

## Output — exactly this block at the end
```
VERDICT: PASS | REWORK
FINDINGS:
  B1 … (blocking: file:line — the concrete failure scenario)
  N1 … (non-blocking)
  (or: none)
NOTES: what you ran and read.
```
