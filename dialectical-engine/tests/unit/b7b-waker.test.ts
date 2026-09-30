import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { WaitingRun } from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import {
  AskRoom,
  type AskRoomEntitlements,
  type AskWaitingLinePort,
  type WaitingStart
} from "../../apps/api/src/ask-room.js";

const NOW = new Date("2026-10-01T00:00:30.000Z");
const MONTH_RESET = new Date("2026-10-15T00:00:00.000Z");
const OWNER = "44444444-4444-4444-8444-444444444444";
const EVENT = "66666666-6666-4666-8666-666666666666";
/** The transaction the application's double hands the enqueue callback. */
const TX = Object.freeze({ marker: "the start's own transaction" }) as unknown as PoolClient;
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function waitingRun(person: Readonly<{ ownerRef?: string; legacyAskerId?: string }>, extra: Partial<WaitingRun> = {}): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-09-30T12:00:00.000Z"),
    ownerRef: person.ownerRef ?? null, legacyAskerId: person.ownerRef === undefined ? (person.legacyAskerId ?? "legacy:x") : null,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-09-30T12:00:00.000Z"),
    ...extra
  });
}

type Outcome = "SITE_FULL" | "PERSON_FULL" | "GONE" | "PLAN_CHANGED" | "THROW";

function arrange(input: {
  readonly pages: ReadonlyArray<ReadonlyArray<WaitingRun>>;
  readonly outcomes?: Readonly<Record<string, Outcome>>;
  readonly dispatchFails?: ReadonlySet<string>;
}) {
  let pages = input.pages;
  const tried: string[] = [];
  const dispatched: string[] = [];
  const recorded: unknown[] = [];
  const reads: Array<Readonly<{ after: string | null; everyPerson: boolean }>> = [];
  // The first job goes on the start's transaction, never on a connection of its own.
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async (client, job) => {
    if (client !== TX) throw new Error("test: the first job must be queued on the start's transaction");
    return `job:${job.runId ?? ""}`;
  });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => {
    throw new Error("test: the waker may not queue a job on a transaction of its own");
  });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    recorded.push(record);
    return true;
  });
  const waitingLine: AskWaitingLinePort = {
    wakeCandidates: async ({ after, everyPerson }) => {
      reads.push({ after: after?.runId ?? null, everyPerson });
      const index = after === null ? 0 : pages.findIndex((page) => page.some((run) => run.runId === after.runId)) + 1;
      return pages[index] ?? [];
    },
    startWaiting: async <T,>(run: WaitingRun, enqueue: (tx: PoolClient) => Promise<T>): Promise<WaitingStart<T>> => {
      tried.push(run.runId);
      const outcome = input.outcomes?.[run.runId];
      if (outcome === "THROW") throw new Error("test: the start's transaction failed");
      if (outcome !== undefined) return { kind: outcome };
      return { kind: "STARTED", value: await enqueue(TX) };
    }
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "b7b", settlementWatchHandle: "b7b",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    waitingLine
  };
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async ({ runId, workItemId }) => {
      if (input.dispatchFails?.has(runId) === true) throw new Error("test: the job system refused");
      if (workItemId !== `job:${runId}`) throw new Error("test: dispatched a job the tick did not queue");
      dispatched.push(runId);
    }) },
    settings, { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() }
  );
  const lines = () => [...info.mock.calls, ...error.mock.calls].map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  const setPages = (next: ReadonlyArray<ReadonlyArray<WaitingRun>>) => { pages = next; };
  return { application, tried, dispatched, recorded, reads, lines, setPages };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("B7b one tick of the waiting line (budget spec §2.7)", () => {
  it("starts runs oldest first, at most one per person per tick", async () => {
    const a1 = waitingRun({ legacyAskerId: "legacy:a" });
    const a2 = waitingRun({ legacyAskerId: "legacy:a" });
    const b1 = waitingRun({ ownerRef: OWNER });
    const { application, tried, dispatched } = arrange({ pages: [[a1, a2, b1]] });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 3, started: 2, skipped: 1, failed: 0, stopped: false });
    expect(tried).toEqual([a1.runId, b1.runId]);
    expect(dispatched).toEqual([a1.runId, b1.runId]);
  });

  it("reads the line page after page from a cursor — never a fixed window — until a page comes back empty", async () => {
    const [a, b, c] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" }), waitingRun({ legacyAskerId: "legacy:c" })];
    const { application, dispatched, reads } = arrange({ pages: [[a], [b], [c]] });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ waiting: 3, started: 3 });
    expect(dispatched).toEqual([a.runId, b.runId, c.runId]);
    expect(reads.map((read) => read.after)).toEqual([null, a.runId, b.runId, c.runId]);
  });

  it("stops at the first run the site's day cannot hold, and reads no further page", async () => {
    const [a, b, c] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" }), waitingRun({ legacyAskerId: "legacy:c" })];
    const { application, tried, dispatched, reads } = arrange({ pages: [[a, b], [c]], outcomes: { [b.runId]: "SITE_FULL" } });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, stopped: true });
    expect(tried).toEqual([a.runId, b.runId]);
    expect(dispatched).toEqual([a.runId]);
    expect(reads).toHaveLength(1);
  });

  it("skips a run whose own person is full, or that no longer waits, and goes on", async () => {
    const [a, b, c] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" }), waitingRun({ legacyAskerId: "legacy:c" })];
    const { application, dispatched } = arrange({ pages: [[a, b, c]], outcomes: { [a.runId]: "PERSON_FULL", [b.runId]: "GONE" } });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 3, started: 1, skipped: 2, failed: 0, stopped: false });
    expect(dispatched).toEqual([c.runId]);
  });

  it("records a waiting run whose owner's plan dropped to Free FAILED as PLAN_CHANGED, so it leaves the line", async () => {
    const [a, b] = [waitingRun({ ownerRef: OWNER }, { planTier: "premium" }), waitingRun({ legacyAskerId: "legacy:b" })];
    const { application, dispatched, recorded } = arrange({ pages: [[a, b]], outcomes: { [a.runId]: "PLAN_CHANGED" } });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 1, stopped: false });
    expect(recorded).toEqual([{ runId: a.runId, batteryRowId: "Q1", commandKey: `S00:${a.runId}:Q1`, reason: "RUN_SETUP_FAILED:PLAN_CHANGED" }]);
    expect(dispatched).toEqual([b.runId]);
  });

  it("records a run whose dispatch fails FAILED, and goes on", async () => {
    const [a, b] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" })];
    const { application, dispatched, recorded } = arrange({ pages: [[a, b]], dispatchFails: new Set([a.runId]) });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 1 });
    expect(recorded).toEqual([{ runId: a.runId, batteryRowId: "Q1", commandKey: `S00:${a.runId}:Q1`, reason: "RUN_SETUP_FAILED:DISPATCH" }]);
    expect(dispatched).toEqual([b.runId]);
  });

  it("leaves a run whose start threw in line for the next tick, logging ids and codes only", async () => {
    // The start wrote nothing (its job is queued on its own transaction, which rolled back), so nothing is recorded.
    const a = waitingRun({ legacyAskerId: "legacy:a" });
    const { application, recorded, lines } = arrange({ pages: [[a]], outcomes: { [a.runId]: "THROW" } });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(recorded).toEqual([]);
    // console.info lines first (the tick), then console.error lines (the failed start).
    expect(lines()).toEqual([
      { event: "api.wait.tick", waiting: 1, started: 0, skipped: 0, failed: 1, stopped: false },
      { event: "api.wait.start_failed", runId: a.runId, diagnostic: expect.any(String) }
    ]);
    expect(JSON.stringify(lines())).not.toContain("test: ");
  });

  it("sweeps every person-recorded run until one tick has gone through the whole line, then only those due", async () => {
    const a = waitingRun({ legacyAskerId: "legacy:a" });
    const { application, reads, setPages } = arrange({ pages: [[a]], outcomes: { [a.runId]: "SITE_FULL" } });
    await application.wakeWaitingRuns();
    // Stopped by the site's day: the sweep is not done yet.
    setPages([[waitingRun({ legacyAskerId: "legacy:b" })]]);
    await application.wakeWaitingRuns();
    await application.wakeWaitingRuns();
    expect(reads.filter((read) => read.after === null).map((read) => read.everyPerson)).toEqual([true, true, false]);
  });

  it("does nothing, and logs nothing, with an empty line", async () => {
    const { application, lines } = arrange({ pages: [] });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 0, started: 0, skipped: 0, failed: 0, stopped: false });
    expect(lines()).toEqual([]);
  });
});

describe("B7b AskRoom.startWaiting decides like an admission, under the same locks", () => {
  function room(input: {
    daySpent?: number;
    ownerSpent?: number;
    waiting?: boolean;
    failAt?: "hold" | "started";
    entitlements?: AskRoomEntitlements | null;
    withPlans?: boolean;
  }) {
    const statements: string[] = [];
    const writes: string[] = [];
    const reasons: unknown[] = [];
    const client = {
      query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
        statements.push(text.includes("pg_advisory_xact_lock") ? `LOCK:${String(values[0])}` : text);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const askRoom = new AskRoom({
      lockPool: { connect: vi.fn(async () => client) } as unknown as Pool,
      spend: {
        readDaySpentMicros: async () => input.daySpent ?? 0,
        readSiteCountedHoldsMicros: async () => 0,
        readOwnerSpentMicros: async () => input.ownerSpent ?? 0,
        readOwnerCountedHoldsMicros: async () => 0,
        openHold: async (_tx, hold) => {
          if (input.failAt === "hold") throw new Error("test: the hold was refused");
          writes.push(`hold:${hold.heldMicros}`);
        }
      },
      line: {
        siteLineBlocking: async () => false,
        wakeCandidates: async () => [],
        waitingForOwner: async () => [],
        waitingForLegacyAsker: async () => [],
        readWaiting: async () => null,
        isWaiting: async () => input.waiting ?? true,
        enterWait: async () => undefined,
        recordReason: async (_tx, runId, reason) => { reasons.push({ runId, ...reason }); },
        markStarted: async (_tx, runId) => {
          if (input.failAt === "started") throw new Error("test: the start mark was refused");
          writes.push(`started:${runId}`);
        }
      },
      estimator: { estimateMicros: async () => 700 },
      personAllowance: {
        read: async () => [{
          scope: "PERSON_MONTH", limitMicros: 1_000, periodStart: new Date("2026-09-15T00:00:00.000Z"),
          resetsAt: MONTH_RESET, finishBasisPoints: 11_000, closeBasisPoints: 9_500
        }]
      },
      entitlements: input.entitlements ?? null,
      billingPlans: input.withPlans === true ? PLANS : null,
      dailyCeilingMicros: 100_000,
      closeBasisPoints: 9_500,
      waitingLinePerPerson: 1,
      clock: () => NOW
    });
    return { askRoom, statements, writes, reasons, client };
  }
  const run = waitingRun({ ownerRef: OWNER });
  const never = async (): Promise<string> => { throw new Error("test: nothing may be queued"); };

  it("writes the hold and the start mark, then queues the first job on the SAME transaction, last", async () => {
    const { askRoom, statements, writes, client } = room({});
    let given: unknown = null;
    const outcome = await askRoom.startWaiting(run, async (tx) => {
      given = tx;
      writes.push("enqueue");
      return "job:1";
    });
    expect(outcome).toEqual({ kind: "STARTED", value: "job:1" });
    expect(writes).toEqual(["hold:700", `started:${run.runId}`, "enqueue"]);
    expect(given).toBe(client);
    expect(statements).toEqual(["BEGIN", "LOCK:2026-10-01", `LOCK:${OWNER}`, "COMMIT"]);
  });

  it.each(["hold", "started"] as const)("queues nothing when the %s write fails, and rolls the start back", async (failAt) => {
    const { askRoom, statements } = room({ failAt });
    const enqueue = vi.fn(async () => "job:never");
    await expect(askRoom.startWaiting(run, enqueue)).rejects.toThrow(/^test: the /u);
    expect(enqueue).not.toHaveBeenCalled();
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("answers SITE_FULL, PERSON_FULL or GONE, and queues nothing", async () => {
    await expect(room({ daySpent: 100_000 }).askRoom.startWaiting(run, never)).resolves.toEqual({ kind: "SITE_FULL" });
    await expect(room({ ownerSpent: 1_000 }).askRoom.startWaiting(run, never)).resolves.toEqual({ kind: "PERSON_FULL" });
    await expect(room({ waiting: false }).askRoom.startWaiting(run, never)).resolves.toEqual({ kind: "GONE" });
  });

  it("writes a fresh reason when it changed or is a person's, and nothing for a run still waiting for the site", async () => {
    // Recorded SITE, and now its own person is full: PERSON, looked at again when the month resets.
    const personFull = room({ ownerSpent: 1_000 });
    await personFull.askRoom.startWaiting(run, never);
    expect(personFull.reasons).toEqual([{ runId: run.runId, waitsFor: "PERSON", personRecheckAt: MONTH_RESET, at: NOW }]);
    // Recorded SITE, and the site still cannot hold it: nothing to write.
    const siteFull = room({ daySpent: 100_000 });
    await siteFull.askRoom.startWaiting(run, never);
    expect(siteFull.reasons).toEqual([]);
    // Recorded PERSON, and now only the site holds it: SITE again, so it holds the line in its turn.
    const person = waitingRun({ ownerRef: OWNER }, { waitsFor: "PERSON", personRecheckAt: new Date("2026-10-01T00:00:00.000Z") });
    const turned = room({ daySpent: 100_000 });
    await turned.askRoom.startWaiting(person, never);
    expect(turned.reasons).toEqual([{ runId: person.runId, waitsFor: "SITE", personRecheckAt: null, at: NOW }]);
    // Recorded PERSON and still full: measured again, so it stops being a candidate until it is due.
    const still = room({ ownerSpent: 1_000 });
    await still.askRoom.startWaiting(person, never);
    expect(still.reasons).toEqual([{ runId: person.runId, waitsFor: "PERSON", personRecheckAt: MONTH_RESET, at: NOW }]);
  });

  it("refuses to start a premium-tier run for a person now on Free (PLAN_CHANGED), and writes nothing", async () => {
    const recordRunChargeScope = vi.fn(async () => undefined);
    const entitlements: AskRoomEntitlements = { current: async () => ({ planId: "FREE", eventId: EVENT }), recordRunChargeScope };
    const { askRoom, writes, reasons } = room({ entitlements, withPlans: true });
    const premium = waitingRun({ ownerRef: OWNER }, { planTier: "premium" });
    await expect(askRoom.startWaiting(premium, never)).resolves.toEqual({ kind: "PLAN_CHANGED" });
    expect(writes).toEqual([]);
    expect(reasons).toEqual([]);
    expect(recordRunChargeScope).not.toHaveBeenCalled();
  });

  it("starts an upgraded Free run, and a run whose plan moved between paid plans, pinned to the entitlement it checked", async () => {
    for (const [planTier, planId] of [["free", "PLUS"], ["premium", "MAX"], ["free", "FREE"]] as const) {
      const current = vi.fn(async () => ({ planId, eventId: EVENT }));
      const scopes: unknown[] = [];
      const entitlements: AskRoomEntitlements = { current, recordRunChargeScope: async (_tx, scope) => { scopes.push(scope); } };
      const { askRoom } = room({ entitlements, withPlans: true });
      const waiting = waitingRun({ ownerRef: OWNER }, { planTier });
      await expect(askRoom.startWaiting(waiting, async () => "job:1")).resolves.toEqual({ kind: "STARTED", value: "job:1" });
      // Read ONCE: the plan the tier was checked against is the plan the run is pinned to.
      expect(current).toHaveBeenCalledTimes(1);
      expect(scopes).toEqual([{ runId: waiting.runId, ownerRef: OWNER, planId, entitlementEventId: EVENT, admittedAt: NOW }]);
    }
  });
});
