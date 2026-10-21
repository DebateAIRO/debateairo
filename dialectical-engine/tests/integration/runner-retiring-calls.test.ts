// Side-by-side spec §4 (plan B Task B8): a retiring release "stops claiming; it lets calls in flight settle". The
// in-process half of that hand-over: once its claims are stopped the runner takes nothing (NO_WORK, one content-free
// RUNNER_RETIRING line, the item left READY for the release taking over); once its calls are stopped, every call already
// sent is answered, the next one is refused before anything is sent (RUNNER_RETIRING), and the work item stays CLAIMED
// under this runner's name until its claim lapses and the next release picks it up (the backstop). The REAL
// WalkingSkeletonRunner, composed as apps/runner/src/main.ts composes it on the preview
// (tests/support/preview-debate-harness.ts), over the two preview gates' unix-socket doubles, on a migrated embedded
// PostgreSQL. Integration suites are skipped by the CI gate: run this file by hand before merging.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@debateai/db";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import type { GateRequest } from "../support/preview-gate-stubs.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createRunnerRetirementSignal } from "../../apps/runner/src/runner-retirement.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stubClosers.splice(0).map((close) => close()));
});
afterAll(async () => database?.stop());

const { startGates, previewRunner, admittedRun } = previewDebateHarness({ pool: () => database.pool, stubClosers });

/** Every non-probe call is held `ms(request)` before its gate answers it; probes are answered at once. */
const heldCalls = (ms: (request: GateRequest) => number) => (request: GateRequest): number => request.kind === "PROBE" ? 0 : ms(request);

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; claimed_by: string | null }>(
    "SELECT state, claimed_by FROM core.work_item WHERE work_item_id = $1", [workItemId])).rows[0];
}

describe("a retiring release starts no new model call (side-by-side §4 backstop)", () => {
  it("a stopped claim takes nothing: NO_WORK, no request, the job stays READY", async () => {
    const debate = await admittedRun("retiring-claims", { panelRefs: PANEL_REFS, depth: 1 });
    const gates = await startGates({}, undefined, undefined, heldCalls(() => 300));
    const signal = createRunnerRetirementSignal();
    const composed = await previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY, retirement: signal });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    signal.stopClaims();

    await expect(composed.runner.executeWorkItem(debate.workItemId)).resolves.toEqual({ kind: "NO_WORK" });

    expect(gates.requests).toEqual([]);
    expect(gates.arrivals).toEqual([]);
    expect(await jobRow(debate.workItemId)).toEqual({ state: "READY", claimed_by: null });
    const retiringLines = warn.mock.calls
      .map(([line]) => { try { return JSON.parse(String(line)) as Record<string, unknown>; } catch { return null; } })
      .filter((line) => line?.event === "RUNNER_RETIRING");
    expect(retiringLines).toEqual([{ kind: "DEBATEAI_RUNNER_CLAIM", event: "RUNNER_RETIRING", workItemId: debate.workItemId }]);
  }, 300_000);

  it("calls in flight settle, the next is refused, the job stays CLAIMED for the backstop", async () => {
    const debate = await admittedRun("retiring-calls", { panelRefs: PANEL_REFS, depth: 1 });
    const signal = createRunnerRetirementSignal();
    let stoppedAt: number | null = null;
    // The calls stop the moment the first model call reaches its gate (claim-time probes are not model calls, and
    // all of them are made before it): that call is in flight, held 300 ms, when the release starts retiring.
    const gates = await startGates({}, undefined, undefined, (request) => {
      if (request.kind === "PROBE") return 0;
      if (stoppedAt === null) {
        signal.stopCalls();
        stoppedAt = performance.now();
      }
      return 300;
    });
    const composed = await previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY, retirement: signal });

    await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({ code: "RUNNER_RETIRING" });

    expect(stoppedAt).not.toBeNull();
    const modelCalls = gates.arrivals.filter((arrival) => arrival.kind !== "PROBE");
    expect(modelCalls).toHaveLength(1);
    // Every call sent before the stop was answered: let settle, never abandoned.
    expect(gates.arrivals.every((arrival) => arrival.answeredAt !== null)).toBe(true);
    expect(gates.requests.length).toBe(gates.arrivals.length);
    // No call reached a gate after the stop.
    expect(gates.arrivals.filter((arrival) => arrival.at > stoppedAt!)).toEqual([]);
    // Left alone for the backstop: still this runner's claim, never FAILED by the retiring release.
    expect(await jobRow(debate.workItemId)).toEqual({ state: "CLAIMED", claimed_by: "runner:preview-busy-model" });
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);
});
