# FIX-02 PLAN-v4 — C3 stored cause-chain implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task, `superpowers:test-driven-development` for every behavior change, `superpowers:systematic-debugging` for any unexpected result, and `superpowers:verification-before-completion` before the single implementation commit.

**Goal:** Prove through the real PostgreSQL pipeline that a scheduler wrapper chain is projected as bounded codes, stored atomically in `obs.occurrence_detail`, and never stores error text.

**Architecture:** The public emitter takes a synchronous browser-safe descriptor snapshot and places the frozen codes beside the existing queue references. The redactor revalidates that snapshot and produces a required post-redaction field. The serialized boundary supplies a frozen empty field to lawful legacy records. The runtime sink inserts details only for newly inserted occurrences, using one direct atomic statement or the existing spooled transaction.

**Tech stack:** TypeScript 7, Vitest 4, `pg` 8, embedded PostgreSQL 18.4, pnpm 11.

**Authority:** `SPEC-v4.md`. `SPEC-v2.md` and `PLAN-v2.md` remain C1 authority; `SPEC-v3.md` and `PLAN-v3.md` remain C2 authority. This plan grants no migration, registry, root-barrel, installer, application, V-stage, or production change.

## Preflight and exact surface

Implement in the dedicated FIX-02 C3 integration worktree based on FIX-01 final `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8` with reviewed FIX-02 commits `2f472e17`, `98ca1829`, and `93fa0240` integrated in order. Do not merge or cherry-pick the result into `dev`.

Before editing:

1. Run `git status --short --branch`, `git rev-parse HEAD`, and `git log --oneline -4`.
2. Re-read `SPEC-v4.md`, this plan, the C1/C2 reports, and the FIX-01 C5 envelope/sink contracts.
3. Confirm `3D000` remains an own data-descriptor code on a real nonexistent-database `pg` error; confirm `cause_relation` still has no conflicting vocabulary/constraint and the writer still has `INSERT` on `obs.occurrence_detail`. Stop and report if any finding differs.
4. Record the pre-edit root import graph. No new `node:*` specifier may become reachable from `packages/obs-capture/src/index.ts`; in particular, do not use `node:util/types` or another proxy/inspection helper.

Authorized product files:

- Create: `packages/obs-capture/src/cause-chain.ts`
- Modify: `packages/obs-capture/src/emit.ts`
- Modify: `packages/obs-capture/src/redactor.ts`
- Modify: `packages/obs-capture/src/envelope-contract.ts`
- Modify: `packages/obs-capture/src/runtime/sink.ts`

Authorized test files are the focused unit/integration files named below and any existing focused fixture file that compilation proves must carry the new required envelope field. Keep `packages/obs-capture/src/index.ts`, installers, spool/drain orchestration, scheduler/database application code, registry, zone code, migrations, grants, and generated files unchanged.

## Task 1: Calling-thread descriptor snapshot

**Files:**

- Create: `packages/obs-capture/src/cause-chain.ts`
- Modify: `packages/obs-capture/src/emit.ts`
- Create: `tests/unit/fix02-cause-storage.test.ts`
- Modify: `tests/unit/obs-l2-s03b-core.test.ts`
- Modify: `tests/unit/fix02-pool-failure.test.ts`

### 1. Write the failing snapshot tests

Add tests that invoke the public emitter with a recording queue and prove:

- scheduler input produces frozen `["OBS_SCHEDULER_JOB_FAILED", "DATABASE_POOL_FAILED", "3D000"]` before queue admission;
- `captureHandled` produces frozen `["DATABASE_POOL_FAILED", "3D000"]`;
- post-call mutation of error codes/causes cannot change the recorded snapshot;
- message, stack, database name, planted credential, and arbitrary code text never appear in the snapshot;
- code/cause accessors are never called;
- a throwing proxy trap terminates as `CAUSE_CODE_UNAVAILABLE`, while a nonthrowing proxy can contribute only exact allowlisted data-descriptor codes;
- self-cycle, two-node cycle, primitive cause, missing descriptor, malformed/trapping descriptor, depth overflow, 64/65-character code boundary, and the eight-code cap terminate deterministically;
- a wrapper without a proved second code yields a frozen one-code queue snapshot, which the redactor later normalizes to the shared frozen empty projected array;
- queue offer/drop behavior and deferred health accounting remain unchanged;
- the transitive root graph contains no new runtime `node:*`, `pg`, or `@debateai/db` import.

Update the existing calling-thread assertion that currently expects references alone: it must now assert that the code snapshot is complete before `queue.offer`, while preserving the existing no-I/O/no-JSON/no-clock/no-getter assertions.

Run:

```bash
pnpm exec vitest run tests/unit/fix02-cause-storage.test.ts tests/unit/obs-l2-s03b-core.test.ts tests/unit/fix02-pool-failure.test.ts
```

Expected: the new snapshot assertions fail because the queue entry has no cause-code field.

### 2. Implement the minimum browser-safe module

In `cause-chain.ts`, define and freeze the exact constants from `SPEC-v4.md` and expose only internal functions needed by the four authorized consumers. Use signatures equivalent to:

```ts
export const EMPTY_CAUSE_CHAIN_CODES: readonly [];
export function snapshotEmittedCause(input: unknown): readonly string[];
export function snapshotHandledCause(error: unknown, context: unknown): readonly string[];
export function projectCauseChainCodes(
  value: unknown,
  wrapperCode: string,
): readonly string[];
export function isProjectedCauseChainCodes(
  value: unknown,
  wrapperCode: string,
): value is readonly string[];
```

Implement a small guarded helper that requests one named own descriptor once and returns only an accepted data value. At each error node, request only `code`, then `cause`; do not enumerate or perform ordinary property reads. Catch every descriptor trap. Track identities for cycle detection. Resolve wrapper codes through `resolveSafeTemplate`; accept driver code only when it is exactly `3D000`; append the fixed unavailable sentinel once for an unsafe/over-bound terminal; remove only the adjacent duplicate between wrapper and first error code. A lawful producer snapshot may have one wrapper code; `projectCauseChainCodes` returns the shared empty array unless at least two lawful codes remain. Never import `node:*`.

In `emit.ts`, add an optional read-only snapshot field to `CaptureQueueEntry` for compatibility with existing internal entries, but populate it on both public emitter paths:

```ts
readonly cause_chain_codes_ref?: readonly string[];
```

Compute `snapshotEmittedCause(envelope)` or `snapshotHandledCause(error, context)` synchronously before calling `enqueue`. Preserve every existing catch, return type, scheduling rule, queue/drop outcome, and payload/context reference.

### 3. Run the focused tests green

Run the same Vitest command. Expected: all selected tests pass, getters stay at zero calls, and the import assertion finds no new Node-only root import.

Do not commit yet; the controller requires one final implementation commit with the exact subject in Task 5.

## Task 2: Redactor and serialized compatibility boundary

**Files:**

- Modify: `packages/obs-capture/src/redactor.ts`
- Modify: `packages/obs-capture/src/envelope-contract.ts`
- Modify: `tests/unit/fix02-cause-storage.test.ts`
- Modify: `tests/unit/fix02-pool-failure.test.ts`
- Modify only if required: `tests/integration/fix01-spool-drain.test.ts`

### 1. Write the failing envelope tests

Add assertions for:

- `PostRedactionEnvelope` always has `cause_chain_codes`;
- a valid scheduler snapshot yields the exact frozen three-code chain, fixed parent sentinel, and `WRAPS`;
- a valid direct pool snapshot yields the exact frozen two-code chain;
- missing, one-code, reordered, oversized, disallowed, mutable-after-entry, or wrapper-mismatched snapshots yield frozen empty, `NO_CAUSE`, and `null`;
- fallback/minimized redaction always clears the chain;
- the redactor never reads an error, cause, message, or stack when a snapshot exists;
- serialized modern envelopes accept only the exact chain/parent/relation combinations;
- an otherwise lawful legacy serialized record missing only `cause_chain_codes` validates only after it has the shared frozen empty array installed;
- malformed/accessor-backed, extra-key, or invalid present fields remain rejected.

Run:

```bash
pnpm exec vitest run tests/unit/fix02-cause-storage.test.ts tests/unit/fix02-pool-failure.test.ts tests/integration/fix01-spool-drain.test.ts
```

Expected: failures show the envelope type, redactor, and serialized contract do not yet project or normalize the field.

### 2. Add the post-redaction projection

Extend `PostRedactionEnvelope` with:

```ts
readonly cause_chain_codes: readonly string[];
readonly parent_occurrence_ref:
  | "NO_CAUSE"
  | "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED";
readonly cause_relation: null | "WRAPS";
```

Pass the queue snapshot into `build`. For `handled_error`, derive the primary safe code from the registered first snapshot item rather than reading `payload_ref`; an absent or invalid snapshot takes the existing minimized fallback. Revalidate the snapshot against the final safe wrapper code, then copy and freeze accepted projected codes. A valid length-two-or-more chain selects the fixed parent/relation; every fallback, minimized event, absent legacy queue snapshot, one-code snapshot, or invalid snapshot selects the frozen empty chain and existing no-cause pair. Do not inspect `entry.payload_ref.error` for cause projection or primary code selection.

### 3. Normalize legacy serialized records before sink use

Add `cause_chain_codes` to the modern exact-key set. At the start of `isSerializedSafeEnvelope`, recognize exactly one legacy shape: an otherwise exact envelope key set missing only this field. Install `EMPTY_CAUSE_CHAIN_CODES` with an own enumerable data property before continuing validation; catch a failed installation and return false. This preserves the existing drain call site while guaranteeing that every value accepted by the guard has the field before its type predicate returns.

For a present lawful array, replace the parsed mutable value with a validated frozen copy before returning true. Reject the record if the descriptor is not an own data property or the frozen replacement cannot be installed.

Validate the full invariant as one unit:

- empty frozen/array value implies `parent_occurrence_ref === "NO_CAUSE"` and `cause_relation === null`;
- nonempty value must be length 2–8, wrapper-first, exact-vocabulary safe and imply the fixed sentinel plus `WRAPS`.

Do not broaden any other legacy key, value, runtime, metadata, parameter, correlation, or zone rule.

### 4. Run the focused tests green

Run the Task 2 test command again. Expected: all selected tests pass, including frozen legacy normalization and raw-text absence.

## Task 3: Atomic occurrence-detail projection

**Files:**

- Modify: `packages/obs-capture/src/runtime/sink.ts`
- Create: `tests/integration/fix02-chain-storage.test.ts`
- Modify only if required: `tests/integration/fix01-spool-drain.test.ts`

### 1. Write failing real-database sink tests

Using the existing embedded-PostgreSQL harness and real migrated schema, test:

- direct insertion of a safe nonempty chain creates one occurrence and one joined detail row;
- an empty chain creates the occurrence only;
- repeated direct insertion stays at one occurrence/one detail;
- a pre-seeded conflicting occurrence without detail does not receive a detail from a later conflicting envelope;
- spooled insertion creates occurrence, detail, then receipt in one transaction;
- replay stays at one occurrence/one detail/one receipt;
- a pre-seeded spooled conflict creates neither detail nor receipt;
- a temporary test-only failing constraint on `obs.occurrence_detail` rolls back a new direct occurrence;
- the same forced detail failure rolls back the spooled occurrence and receipt;
- both paths store envelope `frames`, chain, and template parameters exactly and store no planted raw text.

The test may add and remove a uniquely named failing constraint with the embedded database owner in a `try/finally`. It may not change a repository migration.

Run:

```bash
pnpm exec vitest run tests/integration/fix02-chain-storage.test.ts tests/integration/fix01-spool-drain.test.ts
```

Expected: detail-row assertions fail while existing occurrence writes remain visible.

### 2. Implement one direct atomic statement

Keep `occurrenceValues` as the occurrence projection and add bounded detail parameters for each input row. Build one statement with:

1. an `input` `VALUES` CTE carrying occurrence columns plus detail frames, cause codes, and template parameters;
2. an `inserted` CTE that inserts occurrences from `input`, uses the existing `(source, source_event_ref)` conflict rule, and returns `occurrence_id`, `source`, and `source_event_ref` only for newly inserted rows;
3. a final `INSERT INTO obs.occurrence_detail (...) SELECT ...` joined from `inserted` to `input`, filtered by `jsonb_array_length(cause_chain_codes) > 0`, with `ON CONFLICT (occurrence_id) DO NOTHING`.

Use explicit PostgreSQL casts where the `VALUES` CTE would otherwise infer an ambiguous type. Do not issue a read query, add a transaction per batch, or require another grant. One statement is the direct atomic boundary.

### 3. Extend the existing spooled transaction

After a spooled occurrence returns a new `occurrence_id` and before inserting its receipt, insert one `occurrence_detail` only when the safe chain is nonempty. Bind JSON with `JSON.stringify`; never interpolate values. If the occurrence conflicts, insert neither detail nor receipt. Preserve the existing rollback catch and client release.

### 4. Run the sink tests green

Run the Task 3 test command again. Expected: all direct, conflict, spooled, replay, and forced-rollback assertions pass.

## Task 4: Real scheduler C3 proof

**Files:**

- Modify: `tests/integration/fix02-chain-storage.test.ts`

### 1. Add the failing end-to-end assertion before relying on the sink implementation

In the embedded database test:

1. migrate/provision with the existing FIX-01 harness;
2. record the current maximum occurrence sequence as a baseline;
3. pass a job to the real `runJobWithLifecycle(...)` scheduler boundary whose only database act is `createPool(...).connect()` against a nonexistent database whose name includes a unique planted token; this is the source-validated path that yields `DATABASE_POOL_FAILED` with cause code `3D000`;
4. optionally insert an unrelated later occurrence to prove the selector is not global-latest dependent;
5. query the newest occurrence after the baseline where `code = 'OBS_SCHEDULER_JOB_FAILED'`, ordered by the occurrence sequence;
6. join `obs.occurrence_detail` by `occurrence_id`.

Assert:

```text
cause_relation = WRAPS
parent_occurrence_ref = CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED
cause_chain_codes = [OBS_SCHEDULER_JOB_FAILED, DATABASE_POOL_FAILED, 3D000]
```

Also assert at least two codes, wrapper first, and absence of the planted database token, PostgreSQL message/stack fragments, connection text, credentials, and arbitrary raw failure text from both occurrence and detail JSON/text projections.

Run:

```bash
pnpm exec vitest run tests/integration/fix02-chain-storage.test.ts
```

Expected after Tasks 1–3: the end-to-end test passes without selecting the latest global row.

## Task 5: Mutants, repeated verification, report, and exact commit

**Files:**

- Create: `.superpowers/sdd/PLAN-FixAgent/fix02-c3-implementation-report.md`
- Verify every authorized file above

### 1. Prove the focused suite three times

Run this exact command three separate times and preserve each result in the report:

```bash
pnpm exec vitest run tests/unit/fix02-cause-storage.test.ts tests/unit/fix02-pool-failure.test.ts tests/unit/obs-l2-s03b-core.test.ts tests/integration/fix02-chain-storage.test.ts tests/integration/fix01-spool-drain.test.ts
```

Each run must pass.

### 2. Run adjacent FIX-01/FIX-02 and boundary checks

Run:

```bash
pnpm exec vitest run tests/unit/fix02-cause-chain.test.ts tests/unit/fix01-scheduler-lifecycle.test.ts tests/architecture/obs-l2-s05-import-graph.test.ts tests/architecture/obs-l2-s05-boot-capture.test.ts tests/architecture/fix01-import-graph.test.ts tests/architecture/fix01-spool-release-admission.test.ts tests/integration/fix01-scheduler-row.test.ts
pnpm exec tsc --noEmit
pnpm run audit:architecture
pnpm run audit:source
pnpm run audit:text-bytes
git diff --check
git diff -- packages/db/src/migrations packages/obs-capture/src/registry packages/obs-capture/src/index.ts packages/obs-capture/install apps/scheduler packages/db/src/index.ts
```

All focused/architecture/database checks must pass. For repository-wide type/source commands with pinned pre-existing findings, record the exact output and prove there is no new C3-path finding; do not describe a pinned baseline as green.

### 3. Run privacy/storage mutants one at a time

Temporarily introduce each mutant, run the narrow test named below, confirm a red failure for the intended assertion, and restore the file before the next mutant:

- allow `ECONNRESET` as a driver code → unit snapshot test must fail;
- use an ordinary `.code` or `.cause` read → hostile accessor/proxy test must fail;
- reverse wrapper and inner-code order → wrapper-first unit and database assertions must fail;
- omit legacy normalization → legacy spool/contract test must fail;
- insert detail for an empty chain → nonempty-only database test must fail;
- attach detail to a conflicting pre-existing occurrence → conflict/idempotence test must fail;
- move the spooled receipt before the detail write or swallow detail failure → forced rollback test must fail;
- store message, stack, or planted database text in any detail JSON → no-raw-text test must fail;
- select the latest global occurrence instead of newest relevant wrapper after baseline → unrelated-later-row selector test must fail.

After restoring all mutants, rerun the focused suite once and run `git diff --check`.

### 4. Write the normal implementation report

Record:

- base and integrated commit hashes;
- exact authorized diff;
- the real `3D000` descriptor receipt;
- three focused-run receipts;
- adjacent/type/static/source receipts, including any exact pinned baseline;
- each mutant and its observed red assertion;
- the newest-relevant-row query and stored chain receipt;
- explicit confirmation that migrations, registry, grants, root barrel, installers, applications, and zone policy did not change.

Call the artifact an implementation report only. Do not make a V-stage, production, deployment, or FIX-02 acceptance claim.

### 5. Verify the diff and make the single lawful commit

Run `git status --short`, `git diff --stat`, `git diff --name-only`, and inspect the complete diff. Stage only the authorized C3 code/tests plus the normal report. Then commit with exactly:

```bash
git commit -m "test(obs): FIX-02 C3 — chain codes stored, never text"
```

Finally run `git status --short --branch`, `git show --stat --oneline --decorate HEAD`, and the focused C3 test once more. Return the exact commit hash, changed paths, test receipts, and any pinned baseline. Do not merge/cherry-pick into `dev`, and do not claim V-stage or production acceptance.
