# FIX-01 v2 — Runtime start and early-loss handoff

**FROZEN at ratification — 2026-09-03. V approved Option A. No agent edits this file. A later scope change needs a new version approved by V.**

This file updates the frozen `SPEC.md`. Read both files. If they disagree, this file wins. Every rule in `SPEC.md` that is not changed here still applies.

## 1. Why this update exists

FIX-01 must count every event lost before the runtime starts. The count lives in private state in `packages/obs-capture/src/emit.ts`. The old file rules made that file read-only, so runtime code could not get the count.

The old plan also described a return value that the frozen installers do not accept. The real installer contract has one start function. It returns `void | Promise<void>`.

This update fixes those two conflicts. It also allows the import-graph test already required by the mission plan.

## 2. Runtime API

The runtime subpath exports these types and functions:

```ts
export type FatalExitSink = () => void;

export interface CaptureRuntimeStartOptions {
  readonly runtime: CaptureRuntimeName;
  readonly spoolFd: number | undefined;
  readonly installExitSink: (nextExitSink: FatalExitSink) => void;
}

export interface RuntimeCaptureModule {
  readonly startCaptureRuntime: (
    options: CaptureRuntimeStartOptions,
  ) => void | Promise<void>;
}

export function startCaptureRuntime(
  options: CaptureRuntimeStartOptions,
): Promise<void>;

export function stopCaptureRuntime(options: {
  readonly deadlineMs: number;
}): Promise<void>;
```

The runtime keeps its live state inside the module. `startCaptureRuntime` returns no runtime token. A process has one active capture runtime.

The three frozen installers stay byte-for-byte unchanged. A compile-time test must prove that `startCaptureRuntime` fits their real private contract. The test must not invent a larger installer contract. A source check must also prove that the installer fields are still `runtime`, `spoolFd`, and `installExitSink`.

## 3. Early-loss handoff

Only the default-emitter install seam may change. It has these two forms:

```ts
export function installCaptureEmitter(emitter: CaptureEmitter): void;

export function installCaptureEmitter(
  emitter: CaptureEmitter,
  pendingLossTarget: Pick<CaptureGapCounter, "recordLoss">,
): Promise<void>;
```

The one-argument form keeps its old behavior. It swaps the emitter at once and returns `undefined`.

The two-argument form follows these rules:

1. Swap the emitter before any wait.
2. Wait for one queued microtask. This lets every loss from the old emitter finish counting.
3. Give all old loss rows to the first two-argument caller. Keep each row's source, class, and exact count.
4. Later or concurrent callers get no copy of those old losses. They may wait for the same transfer to finish.
5. Zero losses stay zero. Starting the runtime must not create a fake loss.
6. Both public emit functions stay synchronous, return `void`, and do no file, database, or JSON work on the caller's thread.
7. The private default counter and health state stay private.

The runtime waits for this transfer before it reports `ARMED` and before its first flush.

## 4. Gap writes and retries

The runtime must try one pending gap write on every flush cycle, even when the event queue is empty.

If a gap write fails, the existing counter keeps the full count. The next flush tries again. A failed write must not lose, split, or copy the count.

No change to `packages/obs-capture/src/flusher.ts` is allowed. The runtime owns the empty-queue gap step.

## 5. Required tests

`tests/unit/fix01-queue-gap.test.ts` must prove:

- zero early emits create no gap row;
- one same-turn early emit creates one row with count `1`;
- 37 same-turn early emits create one row with count `37`;
- seven early emits plus one overflow after the swap produce an exact total of `8`;
- two concurrent installs transfer old losses once, to the first owner;
- a later install cannot transfer the same losses again;
- the old one-argument call returns `undefined` and swaps at once;
- a queue of size two keeps two of five new emits and counts three losses.

The FIX-01 database test must prove:

- 37 early emits are written as one `first_party / QUEUE_FULL / 37` gap row even when no event is queued;
- when the first gap write fails, count `37` remains pending and the next flush writes it once.

The C1 contract test must prove the public runtime API fits the real frozen installer source. `tests/architecture/fix01-import-graph.test.ts` remains the import check required by the mission plan.

Each focused command runs three times. A run counts only when it executes tests and has zero failures.

## 6. Required refutations

Each change below must make a named test fail:

- remove the old-loss transfer;
- replace the transferred count with `1`;
- remove the microtask wait;
- move the emitter swap after the wait;
- create one loss at every start;
- copy old losses to more than one caller;
- start the first flush before transfer finishes;
- skip gap writes when the event queue is empty;
- clear a count before a failed database write;
- make the old one-argument install return only a promise;
- rename a runtime function or any of the three start fields;
- make runtime start positional or change its arity.

## 7. File rules

Newly allowed:

- `packages/obs-capture/src/emit.ts`, only the private default state and `installCaptureEmitter` seam that were at lines 94–105 when this file was approved;
- `tests/architecture/fix01-import-graph.test.ts`.

Already allowed by `SPEC.md`:

- `packages/obs-capture/src/runtime/**`;
- `apps/scheduler/src/cli.ts`;
- `tests/unit/fix01-*.test.ts`;
- `tests/integration/fix01-*.test.ts`.

Still read-only:

- every other part of `packages/obs-capture/src/emit.ts`;
- `packages/obs-capture/src/flusher.ts`;
- `packages/obs-capture/install/*.ts`;
- every other read-only file named in `SPEC.md`.

All forbidden paths and operations in `SPEC.md` remain forbidden.

## 8. Work that does not change

FIX-01 still has the same goal: a real scheduler failure creates one safe database row without changing product behavior.

The writer role, secret-removal rules, spool rules, exit rules, scheduler lifecycle, real-stack checks, V veto, and all other requirements in `SPEC.md` stay unchanged.
