# The Docker window — what has to run once Docker is up, and what each run proves

*Written 2026-09-22 by the coordinator. Docker Desktop was not running on this Mac during the whole execution, so every database-backed suite in this branch is written but has never executed here. This file is the checklist for the one window in which they all run, before anything reaches `dev`. Plain-language mirror: [PLAIN-STATUS.md](PLAIN-STATUS.md); checklist line 6 of [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).*

## 1. The runs

All from `dialectical-engine/`, on the release-candidate commit, with Docker Desktop running (the suites start their own PostgreSQL through testcontainers — nothing to provision by hand).

The whole gate, including the integration directory CI never runs:

```bash
pnpm run test:s00
```

The `acceptance/` directory is NOT part of this window: it is the ceremony harness that drives real model relays (the local CLIs in local mode, paid vendors in hosted) — it runs as part of the owner's confirmation run, not against testcontainers. The only acceptance check that belongs here is that it still compiles, which the integration branch already proves on every merge (acceptance tsc 0).

Record the commit, the date, the totals and every failure verbatim in §4 below. A failure is a finding, not a reason to edit the test.

## 2. What the window proves, by area (the properties with NO unit-level proof today)

| Area | Property proven only by a database-backed suite | Where |
|---|---|---|
| Keys (A) | The support KEK rotation's `UPDATE (wrapped_key, destroyed_at)` is accepted by the 0054 CHECK constraint; the `destroyed_at IS NULL AND wrapped_key = $3` bytea comparison through node-pg; `support.assert_shred_integrity()` accepting each commit; `listWrappedKeys`' UNION shape; `assertSupportPrincipalRole`'s SQL witness | `tests/integration/support-kek-rotation-database.test.ts` — NOTE: it runs as the test superuser, so it does NOT prove the rotation under the real `debateai_support` column grant (a follow-up: run it as that role) |
| Keys (A) | The custody group with real group ids (the unit rows skip on a host with fewer than two supplementary groups) | `tests/unit/custody-group.test.ts` (`it.skipIf`) — run on a host with ≥ 2 groups |
| Money (C) | Migration 0066 applies and replays (both tables, every CHECK, the FK to `core.run`, both indexes, `reject_mutation`/`reject_truncate`, the DO contract count of 4, the GRANTs) | migration replay in `test:s00` |
| Money (C) | `PostgresModelSpendStore` SQL text (the `$5::date` insert, the two `coalesce(sum(...))::text` reads, the numeric-text narrowing) | `tests/integration/v28-model-spend.test.ts` |
| Money (C) | `admitNewRun` end to end: `pg_advisory_xact_lock(hashtextextended(...))`, the combined charge + reservation sum with `expires_at > $2`, rollback and lock release, TWO backends serialising | same |
| Money (C) | The seam over a real pool: `readRunSpentMicros` on a second connection while the run's lease holds a client; `recordSpend` failing after a billed call (the never-charge path); two concurrent calls of one run racing the per-run gate | same |
| Money (C) | Whole-run cases 1–12: spend stop during root authoring / expansion / first review; `SINGLE-LINEAGE` with the stop code (never `MONO_MAKER_RUN`); `UNSERVED-MAKER-POSITION` at M=3; `HIDDEN-UNJUDGEABLE` kept; the ledger holds root 0's charges and nothing for the refused call; `PROVIDER_USAGE_UNREPORTED` ends in the envelope terminal | `tests/integration/v28-model-spend.test.ts:172-230` (a numbered `describe.skip` — un-skip it in the window and record the result) |
| Money (C) | Role privileges in practice (`debateai_runtime` inserts into both tables and takes the advisory lock); the 429 + `Retry-After` path through Fastify and the `api.ask.refused` log line | same + `tests/integration/database.test.ts` |
| Money (C) | The register version a fresh database allocates is 5 (the constant was corrected from 6 in the fix wave; the three cases that pin it are expected GREEN now) | `tests/integration/dev-deployment-register.test.ts`, `dev-api-environment.test.ts`, `t16-algorithm-register.test.ts` |
| Money (C) | The reservation TTL (30 min, provisional) against real first-charge latency — unproven at every level; measure it in the owner's paid run | (owner's confirmation run) |
| Support (D) | The owner-bound case token; the 30-day TTL; case-reply redaction and limits; the injection lock; the anonymous IP window/cooldown and cross-instance counters; SHREDDED read/reply; the rotation repository's conditional UPDATE; the real-role witness; `sessionOwnerMatches` | `tests/integration/support-*.test.ts` |
| Support (D) | The evaluator consumer treats pre-change outputs as stale after the prompt version bump (the unit suite's fake repository decides `ALREADY_CURRENT` itself) | `tests/integration/evaluator-consumer-database.test.ts` |
| Runner (F) | A real run body against a real pool reaches the five money-stop catches and the envelope terminal (the CI pin is a source pin: deletion, guard inversion and comment-out, not execution) | `tests/integration/database.test.ts` + the v28 whole-run cases |
| Prompt containment (B) | The database-backed suites repaired by package 9 that live under `tests/integration` | `test:s00` (the ceremony under `acceptance/` belongs to the owner's confirmation run) |
| Benchmark | `pnpm run support:eval` scores something other than 0/60 once the harness's pseudonym matches the 0054 CHECK (fix package FW-E) — needs a database and a model; record the score | `tests/support-eval/run.ts` |

## 3. Then, in the same window (the two packages that were held for Docker)

- **Task 5** — V-17, V-29 (a new migration, number 0067 or later, assigned by the coordinator), B28's tamper check.
- **Task 7** — V-6 (encrypt the remaining readable debate text) and V-26 (account deletion erases the support conversations and revokes the case bearers). The owner asked to be told before V-6 passes one day.

## 4. Results

*(empty until the window runs)*

| Commit | Date | Command | Totals | Failures (verbatim) |
|---|---|---|---|---|
