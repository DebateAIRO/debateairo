# FIX-03 SPEC-v3 — C2 runner artifact and capture-off correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no persisted row, production acceptance, or V attestation.

This file has higher precedence than `SPEC.md` for FIX-03 C2 only. `SPEC-v2.md` still governs C1. C3, database persistence, `obs.run_correlation_v`, and V acceptance stay deferred until FIX-01 is integrated and the controller grants fresh authority.

## C2 artifact scope

Allowed product edit:

- `apps/runner/src/index.ts`, only the import plumbing required by the named task and the `fn` body inside `declareHatchetWalkingSkeletonTask`

Allowed tests:

- `tests/integration/fix03-runner-artifact.test.ts`
- `tests/integration/obs-l3-s06-runner-binding.test.ts`, only the runner-task assertions and stale loader fixtures needed by current imports, advisory locking, and `RunRepository`

`apps/runner/src/main.ts` is read-only. Its runner installer import already exists. The real `RunRepository` export also exists and must not change. The provider gateway behavior is C3. Scheduler files, database files, kernel files, `packages/obs-capture/src/runtime/**`, manifests, and lockfiles stay unchanged.

## Corrected C2 rules

1. The task uses the public `runWithObsContext`, `declaredRef`, and `emit` APIs from `@debateai/obs-capture`.
2. The ambient context declares exactly two refs: `run_ref: declaredRef("run", dispatch.runId)` and `work_item_ref: declaredRef("work_item", dispatch.workItemId)`. It does not declare `attempt_ref` or any other durable ref.
3. Hatchet's retry ordinal goes only to the emitted `attempt_index`. A missing, throwing, negative, fractional, or unsafe retry value becomes `0`.
4. When task execution throws, the first capture call happens before `recordTerminalFailure`. Its envelope carries the caught error, `capture_point: "job"`, `taxonomy_class: "JOB_FAILURE"`, `disposition: "THROWN"`, `source: "hatchet"`, and the retry ordinal.
5. If `recordTerminalFailure` returns true, the exact caught error object is thrown. If it returns false, a second capture call records `RUNNER_FAILURE_STATE_NOT_RECORDED` with the caught error as its cause, then the exact caught error object is thrown. A rejection from `recordTerminalFailure` keeps its existing behavior.
6. A capture emitter throw, capture context setup throw, or capture-off state cannot change task execution, the Hatchet result payload, the terminal write input, the terminal write count, or the error object thrown by the product path.
7. Capture off means the public emitter is not armed or acts as a no-op. `@debateai/obs-capture` remains a declared runner dependency; C2 does not edit package loading or `main.ts`.
8. Artifact proof uses canonical UUID inputs. The projected `run_ref` and `work_item_ref` equal those inputs. `node_ref`, `attempt_ref`, `ledger_ref`, and `at_seq_watermark` stay `UNKNOWN:DECLARED_KIND_REQUIRED`. In zone context, all six refs stay present and equal that sentinel.
9. The deployment-link probe may update its fake modules to match current `main.ts` imports. Its fake `@debateai/db` module must export `createPool`, `configureContentEncryption`, and `RunRepository`. This is a fixture repair, not a database product change.
10. C2 proves only in-memory artifact shape, ordering, exact error identity, retry placement, fixture linkage, and capture-off invariance. It does not prove an `obs.occurrence` row, `PERSISTED`, a database join, retry folding in the database, or V acceptance.

## C2 milestone

C2 artifact work is ready for review when its focused tests pass three fresh runs, every named mutant fails and is restored, adjacent/type/static/scope receipts are recorded, and the commit contains only the allowed files. The separate persisted-row cluster remains `waiting_dependency` on FIX-01.
