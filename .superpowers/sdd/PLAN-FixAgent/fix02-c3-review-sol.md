SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers, superpowers:requesting-code-review, superpowers:verification-before-completion

# FIX-02 C3 Sol rework review

Date: 2026-09-04

Review target: implementation commit `e7b9f6812cafc8808cf5e188cd6440f19beda831` against controller authority `9c7b8b2ca70034c93b0c5ed5dc576a26220e2168`.

Reviewed authority: FIX-02 `SPEC-v4`, `PLAN-v4`, `SPEC-v5`, `PLAN-v5`, `DECISIONS`; the prior Sol report; the implementation report; and the applicable repository/mission/reviewer instructions. This is a C3 code-review report only. It makes no merge, implementation-completion, or verification-stage claim.

## Findings

No blocking or non-blocking findings. I found no reproducible defect in the reviewed delta.

## Prior-finding disposition

| Prior finding | Disposition | Independent evidence |
|---|---|---|
| Hostile serialized accessors could be read and planted text could reach storage | Fixed | `snapshotOwnData` rejects proxies, symbols, accessors, non-enumerable properties, and extras through descriptor snapshots without ordinary source reads (`packages/obs-capture/src/envelope-contract.ts:101`). The total normalizer is guarded by an outer catch and builds a new frozen null-prototype graph (`packages/obs-capture/src/envelope-contract.ts:310`). Hostile input and real-PG probes observed zero getter reads, zero sink calls, zero rows, and zero planted-text matches. |
| Mixed same-key batches could bind occurrence columns and detail from different inputs | Fixed | The direct SQL assigns `input_ordinal`, ranks once by `(source, source_event_ref, input_ordinal)`, inserts only `candidate`, preserves candidate order, and joins detail back to that same candidate (`packages/obs-capture/src/runtime/sink.ts:197`). Both mixed empty/nonempty orders and distinct nonempty A/B orders stored the first input coherently. |
| Proxies and revoked arrays could escape total rejection | Fixed | Both record and array snapshot helpers reject proxies before descriptor/array inspection and catch all reflective failure (`packages/obs-capture/src/envelope-contract.ts:101`, `packages/obs-capture/src/envelope-contract.ts:139`). Outer, nested, array, ownKeys-throwing, and revoked cases all returned `undefined` without throwing. |
| Implementation commit subject was not exact | Fixed | Commit parent is exactly `9c7b8b2c...`; subject is exactly `test(obs): FIX-02 C3 — chain codes stored, never text`. |
| Boot architecture adjustment was outside v4 authority | Resolved by v5 authority | The only boot-capture change asserts the legacy Tier-0 serialized row omits `cause_chain_codes` and removes that newly added field from the redactor comparison. This and the drain admission change are expressly authorized by SPEC-v5/PLAN-v5. |

## Contract review

### Calling-thread cause capture and redaction

- `emit` and `captureHandled` compute their descriptor-only cause snapshots before queue admission (`packages/obs-capture/src/emit.ts:73`, `packages/obs-capture/src/emit.ts:85`).
- Cause traversal uses `Object.getOwnPropertyDescriptor`, never ordinary `.code`, `.cause`, `.error`, `.message`, or `.stack` reads; it enforces the 8-code/64-byte bounds, registered-code allowlist, unavailable sentinel, cycle termination, and wrapper-first ordering (`packages/obs-capture/src/cause-chain.ts:24`, `packages/obs-capture/src/cause-chain.ts:72`).
- The redactor projects only an eligible chain and derives the fixed `NO_CAUSE`/`WRAPS` fields from that projection (`packages/obs-capture/src/redactor.ts:280`). It never retains raw error objects or their text.

### Serialized-envelope normalization and drain use

- Each source record/array is inspected through one descriptor snapshot. Proxies, symbols, accessors, non-enumerable properties, extra keys, sparse arrays, and overlong arrays are rejected before any normalized value is admitted (`packages/obs-capture/src/envelope-contract.ts:101`, `packages/obs-capture/src/envelope-contract.ts:139`).
- Legacy exact-key records default the missing field to the frozen shared `EMPTY_CAUSE_CHAIN_CODES`; modern records receive a separately projected/copy-frozen chain (`packages/obs-capture/src/envelope-contract.ts:334`). The outer envelope, component, parameters, and arrays are independent frozen values; record prototypes are null (`packages/obs-capture/src/envelope-contract.ts:351`). The input is never repaired or mutated.
- The drain calls `normalizeSerializedSafeEnvelope` exactly once per parsed row, performs registry checks only on the returned stable value, pushes only that returned value, and never reads the original again (`packages/obs-capture/src/runtime/drain.ts:420`).

Independent hostile matrix results:

- Outer and nested stateful accessors: rejected, `getterReads=0`, no throw.
- Outer proxy, ownKeys-throwing proxy, revoked proxy, component proxy, frames proxy, cause-chain proxy, and revoked cause-chain array: rejected, no throw.
- Outer/component symbols, non-enumerable extras, array extras, and sparse chain: rejected, no throw.
- Safe modern and legacy neighbors: accepted as distinct frozen null-prototype values; legacy source remained without the field and normalized chain was `[]`.
- Independent drain probe: hostile row had `getterReads=0`, `sinkCalls=0`, no completion artifact, and unchanged bytes; safe legacy row produced one sink call with a distinct frozen normalized value and completion.

### PostgreSQL binding, privileges, conflicts, and atomicity

- Direct insertion is one data-modifying statement. Its candidate row drives both occurrence and detail columns (`packages/obs-capture/src/runtime/sink.ts:208`).
- Real-PG same-key probes covered empty→nonempty, nonempty→empty, chain-A→chain-B, and chain-B→chain-A. In every case the first row determined both the occurrence cause fields and detail JSON. Cross-key A→B preserved occurrence sequence order.
- An existing same-key conflict remained unchanged and received no detail; a safe neighboring key still inserted normally. Sequence gaps caused by PostgreSQL conflict attempts were not treated as ordering violations.
- Writer-role probes inserted direct and spooled details using only INSERT paths. A direct SELECT from `obs.occurrence_detail` failed with PostgreSQL `42501`, proving the writer-role tests did not rely on SELECT privilege.
- Forced detail failures returned PostgreSQL `22012`. Direct rollback left zero occurrence/detail rows; spooled rollback left zero occurrence/detail/receipt rows. The spooled transaction orders occurrence, optional detail, and receipt before commit and rolls back on any error (`packages/obs-capture/src/runtime/sink.ts:241`).
- Hostile-storage real-PG probe: normalizer admission was false, getter reads were zero, stored rows were zero, and planted-text matches were zero.

## Test evidence

Focused real-PG plus unit command, three fresh serial runs:

`pnpm exec vitest run tests/unit/fix02-cause-storage.test.ts tests/unit/fix02-pool-failure.test.ts tests/unit/obs-l2-s03b-core.test.ts tests/integration/fix02-chain-storage.test.ts tests/integration/fix01-spool-drain.test.ts --maxWorkers=1`

- Run 1: PASS — 5 files, 130 tests.
- Run 2: PASS — 5 files, 130 tests.
- Run 3: PASS — 5 files, 130 tests.

Adjacent command:

`pnpm exec vitest run tests/unit/fix02-cause-chain.test.ts tests/unit/fix01-scheduler-lifecycle.test.ts tests/architecture/obs-l2-s05-import-graph.test.ts tests/architecture/obs-l2-s05-boot-capture.test.ts tests/architecture/fix01-import-graph.test.ts tests/architecture/fix01-spool-release-admission.test.ts tests/integration/fix01-scheduler-row.test.ts --maxWorkers=1`

- PASS — 7 files, 138 tests.

The first sandboxed PG attempt was excluded because local socket creation failed with `EPERM`; all reported PG receipts above are fresh elevated real embedded-PostgreSQL runs.

## Mutation sensitivity

All mutations were applied only to a disposable archive, restored after each run, byte-compared against the reviewed production files, and removed.

| Harmful mutation | Focused RED result |
|---|---|
| Permit accessor descriptors and read the source property | 2/30 failures: accessor record admitted and parameter getter invoked. |
| Remove proxy rejection | 1/30 failure: benign proxy incorrectly admitted. |
| Reuse source `component` rather than the null-prototype copy | 1/30 failure: normalized nested prototype was not null. |
| Rank duplicate candidates by descending ordinal | 2/2 focused duplicate-order failures: later detail won. |
| Insert occurrences from raw input rather than one candidate per key | 1/1 failure: attempts changed from 1 to 2. |
| Join detail back to raw input rather than candidate | 2/2 failures: mixed detail mismatch and PostgreSQL `23505`. |
| Push the parsed original from drain instead of the normalized value | 1/1 failure: sink argument was identical to the source. |

The unmutated safe neighbors are covered by the green 130-test focused runs and the independent safe modern/legacy/drain probes.

## Static, text, and scope checks

- `pnpm exec tsc --noEmit`: expected baseline RED only — 8 diagnostics in unchanged `tests/unit/s14-ui.test.ts` for absent `web` modules and dependent types.
- `pnpm run audit:architecture`: expected baseline RED only — unchanged missing `web/package.json`.
- `pnpm run audit:source`: expected baseline RED only — the same five unchanged environment-read findings in install/api, install/runner, install/scheduler, runtime/config, and runtime/index.
- `pnpm run audit:text-bytes`: PASS — `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The files causing all three baseline reds are byte-unchanged by `9c7b8b2c..e7b9f681`.
- `git diff --check 9c7b8b2c..e7b9f681`: PASS.
- Delta: 13 authorized files, 2,336 insertions and 53 deletions. No package manifest, lockfile, migration, unrelated production area, `.hermes`, or forbidden report path changed.
- Final reviewer status contains only this normal review report as untracked; no product, spec, or test edit was made by this review.

## Forward-risk predictions

- A future refactor that converts the descriptor snapshot back to ordinary property access would reintroduce getter execution and mutable-source admission; the accessor and source-independence tests should remain mandatory.
- A future SQL simplification that removes the ranked candidate CTE or rejoins raw input would reintroduce occurrence/detail mixing or duplicate detail writes; the both-order mixed and distinct-chain tests should remain mandatory.
- A future drain refactor that separates validation from normalization could accidentally pass the parsed original; the identity/frozen/null-prototype drain test should remain mandatory.

## SPEC VERDICT

PASS — commit `e7b9f681` satisfies FIX-02 C3 SPEC-v4/PLAN-v4 as amended by SPEC-v5/PLAN-v5 and the recorded decisions. All prior findings are closed; no new finding was reproduced.

## CODE QUALITY VERDICT

PASS — the implementation has a single defensive normalization boundary, stable-value-only drain flow, coherent ordinal-ranked SQL, privilege-correct writes, atomic transactions, bounded descriptor-only cause capture, and regression tests that independently go red under the material harmful mutations.
