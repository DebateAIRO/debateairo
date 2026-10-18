// A fixed run id for one admitted test run (engine redesign R3, Task 17 fix round 1, controller ruling R3-T17.1).
//
// The engine seeds by the RUN id: the map's item order (packages/map/src/items.ts `mapAssignItemIds`, seed `run.runId`) and
// which seats grade, review and attack each node (apps/runner `seatRotationOffset`). `RunRepository.startRun` mints the id
// with `randomUUID()`, so two runs of one scripted debate argue different maps with different graders, and a case that pins
// who leads by strength (ruling W4) is red at random. A test file that needs one reproducible debate installs this wrapper
// as its `node:crypto` mock:
//
//   vi.mock("node:crypto", async (importOriginal) => {
//     const actual = await importOriginal<typeof import("node:crypto")>();
//     const { randomUUIDWithFixedRunId } = await import("../support/fixed-run-id.js");
//     return { ...actual, default: actual, randomUUID: randomUUIDWithFixedRunId(actual.randomUUID) };
//   });
//
// and the harness (`admittedRun(…, { runId })`) names the id just before it starts the run: the NEXT `randomUUID()` call
// (startRun's first statement) returns it, and every other call is the real one. Without the mock the harness refuses
// loudly (`fixedRunIdTaken`), so a case can never believe its run id was fixed when it was not.
type RandomUUID = () => `${string}-${string}-${string}-${string}-${string}`;

let pending: string | null = null;
let installed = false;

/** The `node:crypto` mock's `randomUUID`: the pending fixed id once, else the real one. */
export function randomUUIDWithFixedRunId(actual: RandomUUID): RandomUUID {
  installed = true;
  return () => {
    if (pending === null) return actual();
    const id = pending;
    pending = null;
    return id as ReturnType<RandomUUID>;
  };
}

/** The next `randomUUID()` call returns `runId` (call it just before `startRun`). Refused without the mock. */
export function nextRandomUUIDIs(runId: string): void {
  if (!installed) throw new Error("test: a fixed run id needs the node:crypto mock (tests/support/fixed-run-id.ts)");
  pending = runId;
}

/** After `startRun`: the run got the fixed id (never silently a random one). */
export function fixedRunIdTaken(expected: string, runId: string): void {
  pending = null;
  if (runId !== expected) throw new Error(`test: the run did not take the fixed run id (got ${runId})`);
}

/** R3 final wave P17 (Task 17 Minor 2): drops a pending id whatever happened (a `finally`), so a failed start never leaks it. */
export function clearPendingRunId(): void {
  pending = null;
}
