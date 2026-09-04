# FIX-02 SPEC-v4 — C3 stored cause-chain correction

**Status:** FROZEN for FIX-02 C3 implementation planning only

**Controller approval:** 2026-09-04

**Precedence:** this file narrows and corrects the C3 surface. `SPEC-v2.md` remains authoritative for C1, and `SPEC-v3.md` remains authoritative for C2. It does not grant V-stage acceptance or production approval.

## 1. Scope and source-backed findings

C3 may add the minimum projection and storage surface required to prove that safe cause codes survive the real PostgreSQL pipeline. It may not change migrations, registries, grants, application behavior, zone policy, or the root capture import boundary.

Repository and runtime inspection established:

- `obs.occurrence_detail` already has `occurrence_id UNIQUE`, `normalized_frames jsonb`, `cause_chain_codes jsonb`, and `template_parameters jsonb`.
- The observability writer already has `INSERT` on `obs.occurrence_detail`; C3 needs no grant change and must not require a read grant.
- `obs.occurrence.cause_relation` is nullable text with no conflicting database constraint or competing stored vocabulary. The C3 relation literal is exactly `WRAPS`.
- A real `pg` error for a nonexistent database exposes an own data descriptor `code: "3D000"`. No other driver code is required by C3 acceptance, so the complete driver allowlist is exactly `3D000`.
- `runJobWithLifecycle(...)` emits `OBS_SCHEDULER_JOB_FAILED` for a rejected job. A real `createPool(...).connect()` against the nonexistent database rejects with own wrapper code `DATABASE_POOL_FAILED` whose own `cause` has own data code `3D000`. The C3 scheduler-lifecycle probe therefore expects exactly `OBS_SCHEDULER_JOB_FAILED`, `DATABASE_POOL_FAILED`, `3D000`, in that order.
- The existing root capture path is browser-safe. C3 must add no `node:*`, PostgreSQL, database, runtime-sink, filesystem, or network import to the root barrel or its transitive capture modules.

R04 multi-site expansion, R05 multi-event joins, migrations, registry additions, grant changes, and V-stage acceptance remain outside this correction.

## 2. Fixed vocabulary and bounds

The C3 implementation must use these exact constants and no configurable alternatives:

| Meaning | Exact value |
|---|---|
| maximum stored chain codes | `8` |
| maximum code length | `64` UTF-16 code units |
| registered wrapper codes | exact codes accepted by the existing `resolveSafeTemplate` registry lookup |
| driver-code allowlist | `3D000` only |
| unavailable-code sentinel | `CAUSE_CODE_UNAVAILABLE` |
| relation for a nonempty safe chain | `WRAPS` |
| parent sentinel when the wrapped cause has no separately captured occurrence | `CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED` |
| parent/relation for an empty chain | `NO_CAUSE` / `null` |
| legacy/default chain | a frozen empty array |

Every nonempty projected chain must contain between two and eight codes, put the emitted registered wrapper first, and contain only:

1. an exact registered code for which `resolveSafeTemplate(code)` returns a template;
2. the exact driver code `3D000`; or
3. the exact sentinel `CAUSE_CODE_UNAVAILABLE`.

No prefix matching, case folding, coercion, regular-expression family, dynamic driver discovery, or arbitrary error code is permitted. A producer snapshot may contain only its registered wrapper when it proves no further cause code; the redactor normalizes that one-code snapshot to the frozen empty projected chain because it proves no wrapping relation.

## 3. Calling-thread snapshot contract

Add an internal browser-safe cause-chain module and use it from the emit/capture path. The snapshot is synchronous, bounded, descriptor-only, and complete before `queue.offer(...)` returns.

### 3.1 Allowed reads

- Use guarded `Object.getOwnPropertyDescriptor` requests only. At each traversed error node, request the own `code` descriptor at most once and, only after accepting that step, request the own `cause` descriptor at most once. Request no other descriptor or property.
- A descriptor is accepted only when it is an own data descriptor. Never invoke getters, setters, `toString`, coercion, iteration, enumeration, JSON serialization, inspection helpers, or constructor/name/message/stack reads.
- Each descriptor request must be inside its own nonthrowing guard. A throwing proxy trap, accessor descriptor, malformed descriptor result, non-object hop, cycle, excessive depth, excessive code length, or disallowed code emits `CAUSE_CODE_UNAVAILABLE` once and terminates traversal.
- A nonthrowing proxy may contribute a code only when its returned own data descriptor contains one of the exact allowed strings. It cannot contribute any other value or text.
- Use an identity set to detect cycles. Traverse no more than eight accepted output positions and inspect no cause beyond the bounded traversal. If another cause exists after the last available position, the final position is the unavailable sentinel.
- Adjacent duplication of the emitted wrapper and the first error code is removed. Preserve all other order. The registered emitted wrapper is always the first output item.
- Failure to establish a registered wrapper first produces the empty chain; a sentinel alone is never stored. After the wrapper is established, a missing/invalid error `code` produces the sentinel and stops.
- An absent own `cause` descriptor, or an own data `cause` whose value is `undefined` or `null`, ends normally. An accessor, trapping read, cycle, or non-null primitive cause produces the sentinel and stops.
- When seven positions are already occupied and one more error node exists, reserve the eighth position for the accepted final code only if that node has no further cause. If it has a further cause, put the sentinel in the eighth position and stop. No ninth code or cause is inspected.

### 3.2 Producer behavior

- `emit(...)` snapshots a cause only when the emitted input contains the existing `error` slot and a registered wrapper code. The `error` slot itself must be obtained as one guarded own data-descriptor read; an accessor/trap becomes unavailable rather than being invoked.
- `captureHandled(...)` applies the same snapshot contract to its context and supplied error. It uses an exact registered own data `context.code` as the wrapper when present; otherwise it may use an exact registered own data `error.code` as the wrapper. This preserves existing installer calls whose contexts do not name a code without inspecting error text.
- The emitter adds the frozen bounded code snapshot to the queue entry. The redactor must use that snapshot exclusively for cause projection and must not inspect the queued error/cause reference. Existing queue-entry payload semantics stay unchanged; internal entries that predate or omit the snapshot normalize to the empty chain.
- Queue admission, drop accounting, ordering, return values, timing class, and non-error producer behavior remain unchanged. The snapshot performs no I/O, logging, serialization, asynchronous work, or clock/random access.
- An envelope produced from any path always contains `cause_chain_codes`; paths without a proved wrap carry the shared frozen empty array.

Mutation after the producer call must not change the snapshot or the resulting envelope.

## 4. Redaction and serialized-envelope contract

The redactor is a defense-in-depth boundary, not a second error inspector.

- It accepts only the calling-thread code snapshot, revalidates the exact vocabulary, order, length, and wrapper-first invariant, copies it to a new frozen array, and never reads the original error. For a `handled_error` entry, the first registered snapshot code is also the primary envelope code; an absent/invalid snapshot takes the existing minimized fallback.
- If validation fails, or if the event takes an existing minimized/fallback path, it emits the frozen empty chain with `parent_occurrence_ref: "NO_CAUSE"` and `cause_relation: null`.
- For a valid chain of at least two codes, it emits `parent_occurrence_ref: "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED"`, `cause_relation: "WRAPS"`, and the frozen chain.
- The post-redaction and serialized envelope contracts gain the required bounded field `cause_chain_codes`.
- New producers and serializers always write that field.
- At the serialized validation/deserialization boundary, a legacy JSON record whose only missing modern key is `cause_chain_codes` is normalized before sink use by installing the shared frozen empty array as that field. The existing validation function must reject the value if the normalization cannot be installed. It must not leave a validated sink input with the field absent.
- A present field must already be an array satisfying the bounds and exact vocabulary, and the boundary must replace it with a validated frozen copy before sink use. Invalid, accessor-backed, extra-key, or otherwise malformed serialized records remain rejected; compatibility applies only to absence of this one field on otherwise valid legacy records.

No message, stack, SQL text, database name, connection string, credential, free text, constructor label, or arbitrary code may enter the envelope or serialized spool payload through this feature.

## 5. Storage contract

`occurrence_detail` is projected only from a post-redaction envelope with a nonempty safe chain.

- Persist `normalized_frames = envelope.frames`, `cause_chain_codes = envelope.cause_chain_codes`, and `template_parameters = envelope.template_parameters`.
- The occurrence row and its detail row must be one atomic write unit. A detail failure must leave neither a new occurrence nor a new detail.
- The direct batch sink must preserve set-based insertion and use one data-modifying statement/atomic unit that inserts occurrences and inserts detail rows only for occurrences returned as newly inserted. It must not require a follow-up `SELECT`.
- The spooled sink must insert the occurrence, optional detail, and spool receipt inside its existing transaction. The receipt may be inserted only after every required occurrence/detail write succeeds.
- Existing occurrence uniqueness remains the idempotence authority. On replay or conflict, the sink must add no detail for a pre-existing occurrence and no duplicate spool receipt. `occurrence_detail.occurrence_id UNIQUE` remains a second defense.
- An empty chain produces no `occurrence_detail` row and preserves `NO_CAUSE` / `null` on the occurrence.
- Direct and spooled paths must store the same detail projection for the same safe envelope.

## 6. Authorized edit surface

Only these product surfaces are authorized:

- new internal `packages/obs-capture/src/cause-chain.ts`;
- the existing emit/capture module that constructs queue entries;
- `packages/obs-capture/src/redactor.ts`;
- `packages/obs-capture/src/envelope-contract.ts`;
- `packages/obs-capture/src/runtime/sink.ts`.

Only focused unit/integration test files needed to prove this contract may be added or changed. A normal implementation evidence report may be written under `.superpowers/sdd/PLAN-FixAgent/`.

Explicitly forbidden are edits to the root barrel, frozen installers, spool format/version, flusher/drain orchestration, scheduler or database application code, registry, zone classifier/policy, migrations, grants, generated artifacts, and unrelated tests. Existing import-direction and privacy constraints remain binding.

## 7. Required proof

### 7.1 Unit and hostile-object proof

Tests must cover:

- wrapper-first registered chains and the exact `3D000` allowlist;
- a rejected driver-like or arbitrary code;
- throwing and nonthrowing proxies;
- code/cause accessors whose getters would throw or mutate state, proving zero getter calls;
- malformed descriptors, cycles, non-object causes, maximum depth, over-depth termination, 64/65-character boundaries, maximum chain length, and post-call mutation;
- frozen produced arrays, frozen legacy default arrays, and redactor defensive copying;
- absence of message, stack, free text, SQL, database, credential, and planted-secret content;
- unchanged empty-chain behavior for non-error and unproved-wrap envelopes;
- no new `node:*` import in the root capture transitive graph.

### 7.2 Sink and real PostgreSQL proof

Tests against real embedded PostgreSQL must cover:

- direct and spooled paths;
- nonempty-only detail insertion;
- occurrence conflict/idempotence and spool replay idempotence;
- detail failure rolling back the occurrence, and spooled failure rolling back occurrence plus receipt;
- legacy serialized input without `cause_chain_codes` normalizing to frozen empty before sink use;
- a real scheduler-lifecycle run whose job calls `createPool(...).connect()` against a nonexistent database, selecting the newest relevant `OBS_SCHEDULER_JOB_FAILED` row after a captured baseline by code and sequence, never merely the latest global row;
- non-null `cause_relation = 'WRAPS'`, the fixed parent sentinel, and a joined detail chain of at least two entries with the scheduler wrapper first; the source-backed expected chain is exactly `OBS_SCHEDULER_JOB_FAILED`, `DATABASE_POOL_FAILED`, `3D000`;
- no planted database name, PostgreSQL message/stack text, connection secret, or other raw text in the stored occurrence/detail projection.

Focused tests must pass three consecutive times. Adjacent FIX-01/FIX-02 suites, relevant database/static/type/source checks, and privacy/storage mutants must also pass before the implementation commit. Test success is implementation evidence only; it is not a V-stage or production claim.

## 8. Completion boundary

C3 is implemented only when the authorized code/test delta and normal report satisfy this specification and the implementation commit has the exact subject:

`test(obs): FIX-02 C3 — chain codes stored, never text`

This controller correction itself authorizes that future work. It does not implement C3 and does not accept FIX-02.
