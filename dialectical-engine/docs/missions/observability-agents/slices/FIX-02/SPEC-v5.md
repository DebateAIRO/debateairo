# FIX-02 SPEC-v5 — C3 serialized snapshot and duplicate-row correction

**Status:** FROZEN for FIX-02 C3 review rework only

**Controller approval:** 2026-09-04

**Precedence:** this file corrects only the C3 defects found in the independent review of `e67edc52`. `SPEC-v4.md` remains authoritative for every unaffected C3 requirement; `SPEC-v2.md` and `SPEC-v3.md` remain authoritative for C1 and C2. This correction grants no V-stage, merge, deployment, or production approval.

## 1. Verified defects and correction boundary

The reviewed serialized guard validated a hostile object through repeated ordinary property reads, then the sink read it again. An accessor could therefore return safe values during validation and planted text during storage. Record proxies could throw from exact-key enumeration, and a revoked array proxy could throw from `Array.isArray`.

The reviewed direct batch statement joined each newly inserted occurrence back to every input row with the same `(source, source_event_ref)`. Its unordered `DISTINCT ON` could attach detail from a duplicate row other than the row that supplied the occurrence.

This correction authorizes only the following additions to the `SPEC-v4.md` surface:

1. the exact compatibility assertion edit already present in `tests/architecture/obs-l2-s05-boot-capture.test.ts`; and
2. an admission-only call-site edit in `packages/obs-capture/src/runtime/drain.ts` that consumes the normalized stable envelope returned by the serialized boundary.

The existing `SPEC-v4.md` authority over `envelope-contract.ts`, `runtime/sink.ts`, and focused unit/integration tests remains in force. No drain enumeration, budgeting, file identity, admission seal, completion publication, transaction scheduling, lifecycle, or spool-byte behavior may change.

## 2. Total serialized normalization

Replace mutation-plus-boolean validation with one total normalizer whose result is the only serialized value eligible for sink use.

Use an interface equivalent to:

```ts
export function normalizeSerializedSafeEnvelope(
  value: unknown,
  runtime: SafeRuntimeName,
): PostRedactionEnvelope | undefined;
```

`isSerializedSafeEnvelope(...)` may remain as a compatibility boolean wrapper, but it must call the normalizer and discard the result. It must not assert that the hostile input itself became safe. No caller may pass the original input to a sink after a true boolean result.

### 2.1 One descriptor snapshot

- Reject the outer record, `component`, `frames`, `template_parameters`, and `cause_chain_codes` when any is a Proxy, including a revoked Proxy, before any reflective operation that can invoke its traps. This serialized-only module may use the Node proxy detector because it is already outside the browser-safe root capture graph; no new `node:*` import may enter `cause-chain.ts`, `emit.ts`, the root barrel, or their transitive capture graph.
- For each accepted non-Proxy object or array, obtain one complete own-property-descriptor snapshot inside one nonthrowing guard. Do not return to the source object after that snapshot.
- Reject every symbol key, accessor descriptor, missing data descriptor, unexpected string key, sparse array index, or extra array property. Never invoke a getter, setter, iterator, coercion, serialization hook, prototype lookup, or ordinary source property read.
- Treat any proxy detection failure, descriptor-snapshot failure, invalid descriptor, extra key, symbol, or bound failure as `undefined`. The normalizer is total and must not throw for hostile input.
- The outer record accepts exactly the modern key set or the legacy key set whose only absent field is `cause_chain_codes`. Legacy absence becomes the shared frozen empty array in the returned value; the source input is not mutated.
- A present cause chain is copied from its one descriptor snapshot, checked against all existing v4 vocabulary/order/relation bounds, and frozen. Revoked or other proxied arrays are rejected without a throw.

### 2.2 Stable return value

- Construct a new null-prototype outer envelope from descriptor values only. Every outer field must be an own enumerable data property.
- Construct new null-prototype, frozen `component` and `template_parameters` records. Construct new frozen `frames` and `cause_chain_codes` arrays. The returned outer envelope is frozen.
- Validate only this stable copy after construction. Validation and storage must therefore observe the same code, taxonomy, fingerprint, relation pair, parameters, and chain.
- Retain no reference to the hostile outer object or to its nested record/array objects in the returned value.
- No accessor-supplied, proxy-supplied, message, stack, database, connection, credential, symbol, or other planted text may reach the returned value or `obs.*`.

## 3. Admission-only drain consumption

At the existing per-line admission point in `runtime/drain.ts`:

1. parse JSON exactly as before;
2. call `normalizeSerializedSafeEnvelope(value, parsed.runtime)` once;
3. reject the line when the result is absent;
4. perform the existing taxonomy/template/binding checks against the returned stable envelope only; and
5. enqueue only that returned stable envelope for `ingestSpooledOccurrence`.

Do not read the original parsed value after the normalizer call. Do not change line bounds, file bounds, transaction bounds, directory access, index/admission logic, source snapshots, completion materialization, sink loop ordering, or failure semantics.

## 4. Deterministic direct-batch candidate relation

The direct sink must choose one stable candidate envelope per `(source, source_event_ref)` before both occurrence and detail projection.

- Add a stable one-based input ordinal to each bound row.
- Derive a `candidate` CTE with exactly one row per event key, selecting the lowest input ordinal.
- Insert the occurrence from `candidate`, not the multiplicity-bearing raw input relation.
- Return newly inserted occurrence identity and join detail back to `candidate`, so occurrence columns, relation pair, chain, frames, and parameters always originate from the same chosen row.
- The choice is deterministic: first input wins. Reversing two duplicate inputs reverses the selected complete envelope; it never mixes an occurrence from one row with detail from another.
- Preserve one set-based data-modifying statement, occurrence conflict authority, nonempty-only detail, atomic rollback, and writer operation without `SELECT` on `obs.occurrence_detail`.
- The spooled path and its receipt ordering remain unchanged except for consuming the stable normalized envelope supplied by drain.

## 5. Required RED and proof

Before product edits, focused tests must reproduce each reviewed failure:

- an outer `code` accessor is never invoked, normalization returns absent, the drain makes no sink call, and a real database stores zero rows containing the planted value;
- outer own-key traps, descriptor traps, nested record proxies, proxied arrays, revoked arrays, accessors, extra string keys, and symbol keys return absent without throwing;
- a lawful modern record returns a distinct frozen null-prototype envelope with frozen/copied nested values;
- a lawful legacy record returns the same stable shape with frozen `cause_chain_codes: []` while leaving the source unchanged;
- mutation of every source object/array after normalization cannot alter the returned envelope;
- direct duplicate batches cover empty/nonempty in both orders and two distinct nonempty chains in both orders; every stored occurrence/detail pair exactly matches the complete first input row;
- forced detail failure rolls back occurrence/detail, and the writer-role path succeeds without detail-table `SELECT`.

Tests must also kill these correction mutants one at a time: reuse the original input after normalization; permit one accessor; omit proxy rejection; accept one symbol/extra key; return a nested source reference; choose the highest ordinal; insert occurrence from raw input; join detail to raw input; swallow detail failure; add detail-table `SELECT`; store planted text.

Run the corrected focused real-PostgreSQL suite three consecutive times, then the adjacent FIX-01/FIX-02, database writer-role, static, type, source, import, privacy, rollback, and forbidden-surface checks required by `PLAN-v4.md`.

## 6. Exact edit surface

The complete lawful implementation delta may contain only:

- the existing v4-authorized cause-chain, emit, redactor, serialized-envelope, runtime-sink, focused unit/integration test, and normal-report files;
- `packages/obs-capture/src/runtime/drain.ts`, limited to the admission call and stable-result consumption described in section 3; and
- `tests/architecture/obs-l2-s05-boot-capture.test.ts`, limited to the two-line legacy compatibility assertion reviewed at `e67edc52`.

Controller documents `SPEC-v5.md`, `PLAN-v5.md`, and the one appended DECISIONS row are a separate controller commit. The independent review report is not part of the implementation commit.

Still forbidden: migrations, registry, grants, root barrel, installers, applications, runner/scheduler product code, database barrel, zone policy, spool encoding/version, drain orchestration beyond the one admission call, generated artifacts, and unrelated tests.

## 7. Completion boundary

Rewrite the reviewed implementation history so there is no surviving implementation commit with subject `feat(obs): persist FIX-02 safe cause chains`. After the separate v5 controller commit, the single C3 implementation commit must have exactly:

`test(obs): FIX-02 C3 — chain codes stored, never text`

A normal implementation report may describe RED/GREEN and mutation receipts. It must not claim V acceptance, merge, deployment, or production status.
