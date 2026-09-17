# BUILD-S02-C1 case file — ticket `t_422678f3`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Commit `d2a58e9a` on `slice/tiers-s02` adds nullable `core.run.plan_tier` with the vocabulary constraint, preserves the encrypted function's grants through `CREATE OR REPLACE`, maps the Drizzle column, and threads the value through both writers. The storage contract is exercised at `tests/integration/tiers-s02-run-plan-tier.test.ts:111-180`; the production writes are at `packages/db/src/index.ts:1195-1197` and `packages/db/src/index.ts:1236-1255`.

The required RED frame was `Test Files 1 failed (1)` / `Tests 4 failed (4)`, with all four failures naming `plan_tier`. The final three runs each returned `Test Files 2 passed (2)` / `Tests 25 passed (25)`.

## Cause file

### F1 — the specified invalid UPDATE first met an older immutability trigger

- **Cause:** the first green attempt asserted that `UPDATE core.run SET plan_tier='gold'` would surface SQLSTATE `23514`, but `core.run` already rejects every UPDATE through `core.reject_mutation`; PostgreSQL therefore returned `55000` before evaluating the new CHECK. The initial test observed the wrong guard.
- **Price:** one full cluster retry, 15.25 seconds wall-clock, one failed case (`1 failed | 24 passed (25)`), and roughly 8k tokens of database output.
- **Nearly wrong:** weakening the assertion to “any rejection” would have let the append-only trigger impersonate `run_plan_tier_vocabulary` and would not prove the new constraint.
- **Resolution:** the test suppresses ordinary triggers only inside a transaction, asserts `23514` plus the exact constraint, then rolls back (`tests/integration/tiers-s02-run-plan-tier.test.ts:141-151`).
- **Recommendation:** packet authors should state that the UPDATE probe must isolate the CHECK from the append-only trigger, including the rollback boundary. **VERDICT:** add the isolation recipe to S02-C1-S2. **CONFIDENCE:** high. **STRONGEST COUNTER:** prescribing test mechanics can overconstrain an implementation, but here the existing trigger makes the unqualified oracle observe a different invariant.

### F2 — verbatim board evidence was not capture-first

- **Cause:** S02-C1-S3 required full command output to be pasted after the run, but the packet did not provide a capture-first invocation. The first RED output existed only in the tool transcript, so the command had to run again into a scratch log before it could be posted byte-for-byte.
- **Price:** one duplicate embedded-Postgres run, 4.1 seconds wall-clock, one retry, and roughly 3k repeated output tokens.
- **Dead end:** trying to reconstruct the output manually would not satisfy the verbatim law.
- **Recommendation:** packets that require verbatim comments should publish a scratch-log command before the first execution. **VERDICT:** generate the log path and board-comment wrapper in the packet. **CONFIDENCE:** high. **STRONGEST COUNTER:** this adds packet text, but it removes a whole database run and prevents transcription risk.

### F3 — S02-C1-S4 had no explicit refutation hook

- **Cause:** the four planned cases named the physical database column, constraint, legacy writer and encrypted writer, while S02-C1-S4 separately required the Drizzle mapping. A database-only column assertion remained green when `packages/db/src/schema.ts:121` was removed.
- **Price:** one additional RED/GREEN cycle, about 6.9 seconds, and one test assertion expansion.
- **Nearly wrong:** the cluster could have shipped a correct database migration with stale application schema metadata.
- **Resolution:** case 1 now checks the real database column and Drizzle's exported column mapping in one literal result (`tests/integration/tiers-s02-run-plan-tier.test.ts:112-125`). The absent-mapping mutant was RED while the neighbouring constraint case stayed GREEN.
- **Recommendation:** every PLAN production step should name the assertion or command that refutes its omission. **VERDICT:** extend the architecture packet checker to reject implementation steps without a named refutation hook. **CONFIDENCE:** high. **STRONGEST COUNTER:** trivial metadata changes can make source-shaped tests noisy; this mapping is runtime query metadata and a wrong SQL name is a functional defect.

### F4 — exact-copy and placeholder traps were manually specified but mechanically checkable

- **Cause:** the packet accurately described the two dangerous regions, yet compliance still depended on hand inspection: the 97-line SQL function copy and the duplicated legacy placeholder. The implemented function is at `migrations/0061_plan_tier_on_run.sql:7-103`; the shifted `$14` pair is at `packages/db/src/index.ts:1252-1254`.
- **Price:** two inspection calls and about 4k review tokens. No retry was needed because a process-substitution diff compared 0040 against the transformed 0061 body.
- **Nearly wrong:** a line-based visual review could miss one member of the duplicated placeholder pair or a silent function-body drift.
- **Recommendation:** ship deterministic probes with packets: transform the canonical function using the allowed insertions and `diff`, then count both duplicated placeholders. **VERDICT:** add generated refutation commands beside every “byte-for-byte” or repeated-placeholder charge. **CONFIDENCE:** high. **STRONGEST COUNTER:** generated probes themselves can encode a false rule, so they still need a known-bad mutant check.

### F5 — database command output dominated the evidence channel

- **Cause:** embedded Postgres prints initialization, shutdown and expected-error logs for every isolated test process. Five mutant cycles plus restore runs and three final runs produced far more transport than the test summaries.
- **Price:** about 85 seconds of database wall-clock across refutation/final verification and tens of thousands of raw log tokens; the final three-run gate alone took about 45 seconds.
- **Dead end:** suppressing the logs entirely would make a crash indistinguishable from a valid RED.
- **Recommendation:** retain full scratch logs but make the default seat transcript emit the failing test names, return code, `Test Files`, and `Tests`; expand the full log only on BROKEN or unexpected RED. **VERDICT:** standardize the scratch runner used here as a generated cluster receipt. **CONFIDENCE:** high. **STRONGEST COUNTER:** concise receipts can hide causal context, so the full file must remain addressable until review consumes the handoff.

### F6 — reading-order and reading-floor instructions conflict at the edges

- **Cause:** the user dispatch says packet first and COMMON second; the packet header says COMMON first and then the packet. In addition, the packet says to read only named files, while `using-superpowers` requires `references/codex-tools.md` and TDD requires `writing-good-tests.md`.
- **Price:** three decision points and two extra reference reads, about 4k tokens, with a fabrication risk in `SKILLS LOADED` if references are omitted.
- **Packet ambiguity:** `BUILD-S02-C1.md:3` conflicts with the dispatch ordering; `BUILD-S02-C1.md:5` does not say whether skill-mandated references count as named inputs.
- **Recommendation:** packet generation should produce one ordered, absolute reading manifest that includes transitive mandatory skill references. **VERDICT:** make the manifest the sole reading authority for a seat. **CONFIDENCE:** high. **STRONGEST COUNTER:** skills can add conditional references dynamically, so the manifest needs an explicit “skill-required transitive files are allowed” rule.

## Refutation receipts

| Mutant | Target result | Neighbour result | Restore |
|---|---|---|---|
| `plan_tier varchar(16)` | column case RED | constraint case GREEN | column case `1 passed`, status printed |
| remove `run_plan_tier_vocabulary` | constraint case RED | column case GREEN | constraint case `1 passed`, status printed |
| remove Drizzle `planTier` mapping | column/schema case RED | constraint case GREEN | column/schema case `1 passed`, status printed |
| legacy bind value becomes `NULL` | legacy case RED | encrypted case GREEN | legacy case `1 passed`, status printed |
| encrypted JSON value becomes `NULL` | encrypted case RED | legacy case GREEN | encrypted case `1 passed`, status printed |
| remove `'planTier'` from the function allow-list | encrypted case RED with `RUN_OWNER_INVALID` | legacy case GREEN | encrypted case `1 passed`, status printed |

Every restore showed only the four allowed product paths in `git status --porcelain`; the final commit left the lane clean.

## R12 read-back command

```sh
docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At \
  -c "SELECT plan_tier FROM core.run WHERE run_id='<the run id from the URL>'"
```

Expected output: exactly `free` or exactly `premium` on one line, and empty for a run started before migration 0061. This command was not executed against the live dev database; doing so was outside the seat contract.
