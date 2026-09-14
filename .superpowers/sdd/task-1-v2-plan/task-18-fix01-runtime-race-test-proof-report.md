# FIX-01 in-flight runtime-start race test proof

Date: 2026-09-04

Starting code commit: `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8`

SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review, superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion

## Result

The reported product defect is not present at the exact tracked starting commit. `startCaptureRuntime()` already retains its local `state`, registers the startup promise in that state's `flushInFlight`, and uses the same local state after the emitter transfer. `stopCaptureRuntime()` clears the global active pointer but retains and joins its own local state handle.

No product file was changed. Two public regression tests now lock this behavior against the reported global-state implementation and against rearming a stopped old generation after a restart.

The first test holds the emitter transfer open, observes the frozen C5 `installed` outcome, calls public `stopCaptureRuntime({ deadlineMs: 0 })` so stop returns while start is still in flight, releases the transfer, and requires the original public start promise to resolve. The second starts a new generation before releasing the stopped old generation, then proves the old completion does not arm or drain. The tests do not change readiness timing, outcomes, generation ownership, timers, drain behavior, or database behavior.

## Source reconciliation

At the starting commit:

- `packages/obs-capture/src/runtime/index.ts:284-300` retains the generation's local state and records the startup promise in `state.flushInFlight`.
- `packages/obs-capture/src/runtime/index.ts:291-294` uses `state`, not the mutable global `runtimeState`, after the transfer.
- `packages/obs-capture/src/runtime/index.ts:301-303` retains the stopped/identity guard before arming.
- `packages/obs-capture/src/runtime/index.ts:326-344` captures the current generation and state, clears the global pointers, marks the local state stopped, and joins its in-flight startup before the final flush.

The runtime source SHA-256 is `990ba4a4b47897a8980d80891471fd8fe62737a81075f8808e3416436288cfb9`, exactly equal to `HEAD:dialectical-engine/packages/obs-capture/src/runtime/index.ts` before and after the mutation exercise.

## Refutation evidence

Current tracked product plus the new public test is GREEN:

```text
Test Files: 1 passed
Tests: 1 passed, 10 skipped
```

The supplied harmful implementation was then planted exactly for refutation:

```ts
await flushRuntimeOnce(runtimeState!);
```

The new public test alone went RED with the reported failure:

```text
AssertionError: promise rejected instead of resolving
Caused by: TypeError: Cannot read properties of undefined (reading 'gaps')
at flushRuntimeOnce packages/obs-capture/src/runtime/index.ts:257:15
at packages/obs-capture/src/runtime/index.ts:293:13
Test Files: 1 failed
Tests: 1 failed, 10 skipped
```

The ten pre-existing readiness cases all remained GREEN under that same mutant while the new case was excluded:

```text
Test Files: 1 passed
Tests: 10 passed, 1 skipped
```

The global-state mutant was reverted exactly.

A second harmful mutant removed the existing stopped/identity guard before arming. The restart-isolation test went RED because the old generation reached drain after the new generation, producing `drainCalls === 2` instead of the required `1`. That mutant was also reverted exactly.

As a neighboring specificity control, advancing the opaque internal generation counter by two rather than one left both new tests GREEN (2/2). The tests are therefore tied to state ownership and stopped-generation inertia, not incidental generation numbering. The control was reverted exactly.

These checks prove the new cases are non-redundant, kill both the specific regression and its lifecycle-overreach alternative, and do not demand a product rewrite.

## Final verification

```text
focused readiness: 12/12, three consecutive runs
C1-C5 + FIX-03 + S03b + S05 non-database set: 261/261
scheduler row + full spool drain database set: 61/61
contract generation: passed; no generated diff
text-byte audit: REPOSITORY_TEXT_CONTROL_BYTES=0
git diff --check: passed
runtime source versus HEAD: byte-identical
```

`pnpm typecheck` reports only the same eight pinned sparse-worktree diagnostics in `tests/unit/s14-ui.test.ts`, and no FIX-01 diagnostic.

`pnpm audit:source` reports only the same five pinned process-environment reads. `pnpm audit:architecture` reports only the known sparse-worktree `ENOENT` for absent `web/package.json`.

The first combined test attempt was invalid only for the two database suites because the sandbox denied loopback binding with `listen EPERM 127.0.0.1`. The non-database set was rerun cleanly, and the two database suites were rerun with loopback permission and passed 61/61.

## Scope

The candidate changes exactly:

- `tests/unit/fix01-runtime-readiness.test.ts`
- this report

Runtime, emit, flusher, scheduler, installers, provider, registry, migration, frozen docs, V records, and Hermes records are unchanged. Pre-existing untracked `.hermes` files were not used, modified, or staged.
