# FIX-02 C3 implementation report

Date: 2026-09-04

Status: revised implementation candidate prepared for fresh independent review. This report does not claim V acceptance, merge, or production readiness.

## Integration baseline and controller authority

- Branch: `codex/oa-fix-02-c3` in its isolated integration worktree.
- Required FIX-01 base: `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8`.
- Reviewed FIX-02 commits are integrated as equivalent worktree commits: C1 `05d99edf`, C1 tests `fda87007`, and C2 `3ad12104`.
- C3 storage authority is present as `a9200680` (`docs(obs): authorize FIX-02 C3 cause storage`).
- Review-rework authority is present as `9c7b8b2c` (`docs(obs): authorize FIX-02 C3 review rework`). It adds SPEC-v5, PLAN-v5, and exactly one append-only FIX-02 decision row.
- The implementation commit retains the controller-required exact subject `test(obs): FIX-02 C3 — chain codes stored, never text`.

The governing SPEC-v5, PLAN-v5, and DECISIONS were read completely before rework. The previous FIX-02 specifications/plans, the relevant FIX-01 envelope/sink/spool/writer-role contracts, and the complete independent review were also read.

## Revised lawful delta

The candidate remains inside the controller-authorized C3 surface.

- `packages/obs-capture/src/cause-chain.ts` performs the bounded, synchronous, descriptor-only cause snapshot. It remains browser-safe and gains no `node:*` import.
- `packages/obs-capture/src/emit.ts` snapshots before queue admission; the root capture import graph gains no `node:*` import.
- `packages/obs-capture/src/redactor.ts` projects only a bounded frozen safe-code array and fixed relationship vocabulary.
- `packages/obs-capture/src/envelope-contract.ts` now supplies a total serialized-envelope normalizer. It rejects accessors, proxies (including revoked arrays), symbols, extras, sparse/oversized arrays, and invalid descriptors without throwing or reading getters. Accepted input is copied once into frozen, own-data, null-prototype records and separately frozen arrays. Lawful legacy records missing only `cause_chain_codes` receive a frozen empty array in the returned copy; their source is not mutated.
- `packages/obs-capture/src/runtime/drain.ts` makes only the SPEC-v5 admission-site change: it consumes the normalized stable envelope for registry/binding checks and sink admission. Enumeration, scheduling, locking, cursor, lifecycle, and spool behavior are unchanged.
- `packages/obs-capture/src/runtime/sink.ts` derives a deterministic candidate per `(source, source_event_ref)` from the stable input ordinal, uses that same candidate for occurrence and detail, and preserves cross-key input insertion order. Direct storage is one atomic statement. Spooled occurrence, nonempty detail, and receipt remain in the existing transaction. Conflicts do not backfill detail or receipt.
- The exact compatibility change to `tests/architecture/obs-l2-s05-boot-capture.test.ts` is covered by SPEC-v5. Focused unit and integration tests cover hostile admission, direct/spooled storage, duplicate mapping, writer permissions, rollback, and privacy.

No migration, registry, grant, root barrel, installer, application, scheduler, database barrel, runtime orchestration/configuration, zone, or privacy-policy source changed.

## Pinned projection contract

- Maximum cause chain: 8 codes.
- Maximum accepted code length: 64 UTF-16 code units.
- Allowed codes: existing registered safe-template codes, exact driver code `3D000`, and fixed terminal sentinel `CAUSE_CODE_UNAVAILABLE`.
- Wrapper code is first.
- Nonempty relation: `WRAPS` with parent sentinel `CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED`.
- Empty relation: `cause_relation = null` and `parent_occurrence_ref = NO_CAUSE`.
- Detail is inserted only for a nonempty safe chain.

## Review-rework TDD receipts

Real REDs were captured before each correction:

- Serialized normalizer unit suite: 8 failures and 22 passes. The previous compatibility guard accepted accessor-backed input and no stable normalizer existed.
- Real-Postgres C3 suite: 3 failures and 8 passes. The earlier direct batch could combine the occurrence fields from one duplicate with detail from another, and accessor-backed admission could reach storage.
- Drain admission RED: after narrowing the JSON parse seam to the envelope record rather than the spool index, the hostile getter was invoked five times. The stable normalized-copy test also killed a mutant that pushed the original parsed object.
- Writer-role RED: adding `ON CONFLICT (occurrence_id)` to the detail insert required an unauthorized read and failed under `debateai_obs_writer` with PostgreSQL `42501`. Restoring the plain INSERT passed and stored one occurrence plus one detail.
- Adjacent lifecycle RED: the candidate CTE initially lost input ordering across distinct event keys. The existing real scheduler lifecycle test observed `FAILED, STARTED` for the first pair. Ordering the candidate insert by `input_ordinal` restored the existing two `STARTED, FAILED` pairs.

The scheduler storage proof takes an occurrence-sequence baseline, executes `runJobWithLifecycle(...)` around a real failed `createPool(...).connect()`, plants a later unrelated global occurrence, and selects the newest relevant failed wrapper by code after the baseline. Its joined row contains:

```text
cause_relation = WRAPS
parent_occurrence_ref = CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED
cause_chain_codes = [OBS_SCHEDULER_JOB_FAILED, DATABASE_POOL_FAILED, 3D000]
```

The stored occurrence/detail projection contains none of the planted database name, message, stack, password, or credential text.

## Mutation controls

Each mutation produced RED and was restored before final GREEN:

1. drain pushes the original parsed value after normalization;
2. serialized own-data snapshot permits and reads an accessor;
3. serialized normalizer omits explicit proxy rejection;
4. serialized normalizer accepts an extra symbol;
5. normalized envelope retains the source component reference;
6. legacy missing-field normalization is removed;
7. duplicate candidate selects highest rather than lowest input ordinal;
8. occurrence insertion consumes raw duplicate input instead of the candidate;
9. detail joins raw duplicate input instead of the occurrence candidate;
10. empty chains insert detail;
11. a conflict is made visible to detail insertion;
12. a spooled detail error is swallowed;
13. detail adds `ON CONFLICT`, requiring writer-role read privilege;
14. planted raw message text is persisted in detail.

The pre-existing C3 controls also kill ordinary cause-property access, reversed wrapper order, expanded driver allowlists (`3D001`/`ECONNRESET`), unbounded depth/length, raw-text retention, and newest-global-row selection.

## Verification receipts

Focused command, run three times:

```text
pnpm exec vitest run tests/unit/fix02-cause-storage.test.ts tests/unit/fix02-pool-failure.test.ts tests/unit/obs-l2-s03b-core.test.ts tests/integration/fix02-chain-storage.test.ts tests/integration/fix01-spool-drain.test.ts --maxWorkers=1
```

All three confirmed runs passed identically: 5 files, 130 tests.

Adjacent FIX-01/FIX-02 command:

```text
pnpm exec vitest run tests/unit/fix02-cause-chain.test.ts tests/unit/fix01-scheduler-lifecycle.test.ts tests/architecture/obs-l2-s05-import-graph.test.ts tests/architecture/obs-l2-s05-boot-capture.test.ts tests/architecture/fix01-import-graph.test.ts tests/architecture/fix01-spool-release-admission.test.ts tests/integration/fix01-scheduler-row.test.ts --maxWorkers=1
```

After the input-order correction, the complete adjacent run passed: 7 files, 138 tests.

Static and contract evidence:

- `git diff --check`: passed.
- Forbidden-surface diff from controller commit `9c7b8b2c`: empty for migrations, registry, root barrel, installers, apps, database barrel, runtime orchestration/configuration, and zone sources.
- Root cause snapshot/import control: passed; `cause-chain.ts` and `emit.ts` contain no `node:*` import, and the adjacent import-graph tests pass.
- `pnpm run audit:text-bytes`: passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `pnpm exec tsc --noEmit`: reaches only the pinned unrelated `tests/unit/s14-ui.test.ts` baseline: two missing `web/lib` modules, two unknown labels, two missing event-payload properties, and two implicit-any callback parameters.
- `pnpm run audit:architecture`: reaches only the pinned absent `web/package.json` baseline.
- `pnpm run audit:source`: reaches only the five pinned pre-existing environment-loader findings in three installers plus `runtime/config.ts` and `runtime/index.ts`; no C3 source is reported.

## Handoff

The revised candidate is ready for a fresh independent Sol review. No merge or dev-branch mutation was performed.
