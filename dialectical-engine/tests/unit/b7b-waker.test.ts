import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { PostgresAskApplication, ReleaseNotServedError, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, type StoredAsk, type WaitingRun } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import {
  AskRoom,
  type AskAdmissionGate,
  type AskRoomEntitlements,
  type AskWaitingLinePort,
  type Readmission,
  type WaitingStart
} from "../../apps/api/src/ask-room.js";
import type { ReadmissionPlan } from "../../apps/api/src/readmission.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const NOW = new Date("2026-10-01T00:00:30.000Z");
const MONTH_RESET = new Date("2026-10-15T00:00:00.000Z");
const OWNER = "44444444-4444-4444-8444-444444444444";
const EVENT = "66666666-6666-4666-8666-666666666666";
/** The transaction the application's double hands the enqueue callback. */
const TX = Object.freeze({ marker: "the start's own transaction" }) as unknown as PoolClient;
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
/** Side-by-side C11: the release that admitted a run the current release re-admits (built from pieces: gitleaks). */
const OLD_RELEASE = ["r16", "0123456789ab"].join("-");

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function waitingRun(person: Readonly<{ ownerRef?: string; legacyAskerId?: string }>, extra: Partial<WaitingRun> = {}): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-09-30T12:00:00.000Z"), releaseKey: TEST_RELEASE_KEY,
    ownerRef: person.ownerRef ?? null, legacyAskerId: person.ownerRef === undefined ? (person.legacyAskerId ?? "legacy:x") : null,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-09-30T12:00:00.000Z"),
    ...extra
  });
}

type Outcome = "SITE_FULL" | "PERSON_FULL" | "GONE" | "PLAN_CHANGED" | "THROW";
/** Side-by-side C11: one answer of the fake line per `startWaiting` call, in order. */
type Step = "NEEDS_READMISSION" | "ASK_AGAIN" | Readonly<{ startAs: string }>;

/** A waiting debate's stored ask, as C10's `readStoredAsk` reads it (another release admitted it). */
function storedAsk(runId: string, overrides: Partial<StoredAsk> = {}): StoredAsk {
  return Object.freeze({
    runId, releaseKey: OLD_RELEASE, registerVersion: 16,
    questionLine: "Should a waiting debate be re-admitted under the current release?",
    askContract: Object.freeze({ decision_scope: "b7b waker", steering_presets: [], steering_annotations: [] }),
    askerId: "legacy:x", sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date("2026-09-30T12:00:00.000Z"),
    askerRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:b7b", compositionBudgetTier: "low",
    planTier: "free", depthParams: Object.freeze({ depth: 1 }), argumentLanguageTag: "en", argumentLanguageName: "English",
    contentEncrypted: false, ...overrides
  });
}

function arrange(input: {
  readonly pages: ReadonlyArray<ReadonlyArray<WaitingRun>>;
  readonly outcomes?: Readonly<Record<string, Outcome>>;
  /** Side-by-side C11: per run, the fake line's answer to each `startWaiting` call in turn (after `outcomes`). */
  readonly steps?: Readonly<Record<string, ReadonlyArray<Step>>>;
  /** Side-by-side C11: what `readStoredAsk` reads for a run another release admitted. */
  readonly stored?: (runId: string) => StoredAsk | null;
  /** Side-by-side C11: per run, the typed code its start throws (nothing written). */
  readonly typedThrow?: Readonly<Record<string, string>>;
  readonly dispatchFails?: ReadonlySet<string>;
  /** Side-by-side C4: the runs whose release no longer serves them (the routed dispatcher closed the job and refused). */
  readonly notServed?: ReadonlySet<string>;
  /** Important 4: the started runs whose first job is still READY past the bound (the repository's answer). */
  readonly stalled?: ReadonlyArray<string>;
}) {
  let pages = input.pages;
  const tried: string[] = [];
  const readmissions: Array<Readmission | undefined> = [];
  const dispatched: string[] = [];
  const recorded: unknown[] = [];
  const storedReads: string[] = [];
  vi.spyOn(RunRepository.prototype, "readStoredAsk").mockImplementation(async (runId) => {
    storedReads.push(runId);
    if (input.stored === undefined) throw new Error("test: no stored ask was expected to be read");
    return input.stored(runId);
  });
  const reads: Array<Readonly<{ after: string | null; everyPerson: boolean }>> = [];
  const stalledAsked: unknown[] = [];
  vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockImplementation(async (asked) => {
    stalledAsked.push(asked);
    return (input.stalled ?? []).map((runId) => Object.freeze({ runId, workItemId: `job:${runId}` }));
  });
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
    startWaiting: async <T,>(
      run: WaitingRun, enqueue: (tx: PoolClient, runId: string) => Promise<T>, readmission?: Readmission
    ): Promise<WaitingStart<T>> => {
      const call = tried.filter((runId) => runId === run.runId).length;
      tried.push(run.runId);
      readmissions.push(readmission);
      const outcome = input.outcomes?.[run.runId];
      if (outcome === "THROW") throw new Error("test: the start's transaction failed");
      if (outcome !== undefined) return { kind: outcome };
      const typed = input.typedThrow?.[run.runId];
      if (typed !== undefined) throw new TypedDomainError(typed, "test: typed refusal");
      const step = input.steps?.[run.runId]?.[call];
      if (step === "NEEDS_READMISSION") return { kind: "NEEDS_READMISSION", planId: null };
      if (step === "ASK_AGAIN") return { kind: "ASK_AGAIN" };
      if (step !== undefined) return { kind: "STARTED", runId: step.startAs, value: await enqueue(TX, step.startAs) };
      return { kind: "STARTED", runId: run.runId, value: await enqueue(TX, run.runId) };
    }
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "b7b", settlementWatchHandle: "b7b",
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
      if (input.notServed?.has(runId) === true) throw new ReleaseNotServedError(runId, "r16-0123456789ab", true);
      if (workItemId !== `job:${runId}`) throw new Error("test: dispatched a job the tick did not queue");
      dispatched.push(runId);
    }) },
    settings, { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() }
  );
  const lines = () => [...info.mock.calls, ...error.mock.calls].map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  const setPages = (next: ReadonlyArray<ReadonlyArray<WaitingRun>>) => { pages = next; };
  return { application, tried, readmissions, dispatched, recorded, reads, lines, setPages, stalledAsked, storedReads };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("B7b one tick of the waiting line (budget spec §2.7)", () => {
  it("starts runs oldest first, at most one per person per tick", async () => {
    const a1 = waitingRun({ legacyAskerId: "legacy:a" });
    const a2 = waitingRun({ legacyAskerId: "legacy:a" });
    const b1 = waitingRun({ ownerRef: OWNER });
    const { application, tried, dispatched } = arrange({ pages: [[a1, a2, b1]] });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 3, started: 2, skipped: 1, failed: 0, stopped: false, redispatched: 0 });
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
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 3, started: 1, skipped: 2, failed: 0, stopped: false, redispatched: 0 });
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

  it("counts a run whose release no longer serves it failed, records no DISPATCH failure over it, and goes on (side-by-side C4)", async () => {
    // The routed dispatcher already closed the job FAILED as RUN_SETUP_FAILED:RELEASE_NOT_SERVED and wrote the waiver.
    const [a, b] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" })];
    const { application, dispatched, recorded, lines } = arrange({ pages: [[a, b]], notServed: new Set([a.runId]) });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 2, started: 1, skipped: 0, failed: 1, stopped: false, redispatched: 0 });
    expect(recorded).toEqual([]);
    expect(dispatched).toEqual([b.runId]);
    expect(lines()).toContainEqual({ event: "api.wait.release_not_served", runId: a.runId, releaseKey: "r16-0123456789ab", closed: true });
    expect(lines().some((line) => line.event === "api.wait.started" && line.runId === a.runId)).toBe(false);
  });

  it("gives a tick with failed: 1, started: 0 when the only run's release no longer serves it (side-by-side C4)", async () => {
    const a = waitingRun({ legacyAskerId: "legacy:a" });
    const { application, recorded } = arrange({ pages: [[a]], notServed: new Set([a.runId]) });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ failed: 1, started: 0 });
    expect(recorded).toEqual([]);
  });

  it("leaves a run whose start threw in line for the next tick, logging ids and codes only", async () => {
    // The start wrote nothing (its job is queued on its own transaction, which rolled back), so nothing is recorded.
    const a = waitingRun({ legacyAskerId: "legacy:a" });
    const { application, recorded, lines } = arrange({ pages: [[a]], outcomes: { [a.runId]: "THROW" } });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(recorded).toEqual([]);
    // console.info lines first (the tick), then console.error lines (the failed start).
    expect(lines()).toEqual([
      { event: "api.wait.tick", waiting: 1, started: 0, skipped: 0, failed: 1, stopped: false, redispatched: 0 },
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
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 0, started: 0, skipped: 0, failed: 0, stopped: false, redispatched: 0 });
    expect(lines()).toEqual([]);
  });
});

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 (plan C task C11) — the waker's two phases. The room answers
 * NEEDS_READMISSION for a run another release admitted, writing nothing; the waker then plans the run's re-admission
 * (the only place a probe may run) and asks the room again with the plan, under the owner's lease.
 */
describe("side-by-side C11: the waker re-admits a run another release admitted", () => {
  it("NEEDS_READMISSION, then a plan that is NOT_NOW: skipped, and the room is not asked again", async () => {
    // The plan's evaluation finds none of the plan's models (discovery answers []): a passing refusal, NOT_NOW.
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const { application, tried, storedReads, dispatched, recorded, lines } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION"] }, stored: (runId) => storedAsk(runId)
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 0, skipped: 1, failed: 0, stopped: false, redispatched: 0 });
    expect(storedReads).toEqual([a.runId]);
    expect(tried).toEqual([a.runId]);
    expect(dispatched).toEqual([]);
    expect(recorded).toEqual([]);
    expect(lines()).toContainEqual({ event: "api.wait.readmission_not_now", runId: a.runId, code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
  });

  it("ASK_AGAIN: failed, and the old run is recorded FAILED as CHOICE_UNAVAILABLE", async () => {
    // A stored ask that no longer parses (no plan tier) is planned ASK_AGAIN; the room says START, so it is closed.
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const { application, tried, readmissions, dispatched, recorded } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", "ASK_AGAIN"] }, stored: (runId) => storedAsk(runId, { planTier: null })
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 0, skipped: 0, failed: 1, stopped: false, redispatched: 0 });
    expect(tried).toEqual([a.runId, a.runId]);
    expect(readmissions[0]).toBeUndefined();
    expect(readmissions[1]?.plan).toEqual({ kind: "ASK_AGAIN" });
    expect(recorded).toEqual([{ runId: a.runId, batteryRowId: "Q1", commandKey: `S00:${a.runId}:Q1`, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE" }]);
    expect(dispatched).toEqual([]);
  });

  it("a second NEEDS_READMISSION (the plan moved under the lock): skipped, nothing recorded", async () => {
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const { application, tried, recorded, dispatched } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", "NEEDS_READMISSION"] }, stored: (runId) => storedAsk(runId, { planTier: null })
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1, failed: 0 });
    expect(tried).toEqual([a.runId, a.runId]);
    expect(recorded).toEqual([]);
    expect(dispatched).toEqual([]);
  });

  it.each(["RUN_SUPERSEDED", "RUN_READMISSION_TAKEN", "RUN_READMISSION_INVALID", "RUN_READMISSION_OWNER_GONE"])(
    "a start refused %s wrote nothing and is not this tick's: skipped, not failed", async (code) => {
    const [a, b] = [waitingRun({ legacyAskerId: "legacy:a" }), waitingRun({ legacyAskerId: "legacy:b" })];
    const { application, dispatched, recorded, lines } = arrange({ pages: [[a, b]], typedThrow: { [a.runId]: code } });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 2, started: 1, skipped: 1, failed: 0, stopped: false, redispatched: 0 });
    expect(dispatched).toEqual([b.runId]);
    expect(recorded).toEqual([]);
    expect(lines()).toContainEqual({ event: "api.wait.readmission_skipped", runId: a.runId, code });
  }
  );

  it("STARTED with another run id: the dispatch carries the started run, not the waiting one", async () => {
    const a = waitingRun({ legacyAskerId: "legacy:a" });
    const { application, dispatched } = arrange({ pages: [[a]], steps: { [a.runId]: [{ startAs: "new" }] } });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(dispatched).toEqual(["new"]);
  });
});

/**
 * Final review Part 1b, Important 4 — a started run whose first job was never
 * handed to a runner. Its hold counts while that job is READY, on every later
 * day and window, so each tick hands such a job (READY past the bound) to the
 * job system again, counts it in api.wait.tick, and never records it FAILED.
 */
describe("Important 4: the waker hands a stalled first job to the job system again", () => {
  const BOUND_MS = 300_000;
  afterEach(() => { vi.useRealTimers(); });

  it("asks for jobs READY past five minutes, re-dispatches them, and counts them in the tick even with an empty line", async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    const { application, dispatched, recorded, lines, stalledAsked } = arrange({ pages: [], stalled: [first, second] });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({
      waiting: 0, started: 0, skipped: 0, failed: 0, stopped: false, redispatched: 2
    });
    expect(stalledAsked).toEqual([{ olderThanSeconds: BOUND_MS / 1_000, limit: 100 }]);
    expect(dispatched).toEqual([first, second]);
    expect(recorded).toEqual([]);
    expect(lines()).toEqual([
      { event: "api.wait.redispatched", runId: first },
      { event: "api.wait.redispatched", runId: second },
      { event: "api.wait.tick", waiting: 0, started: 0, skipped: 0, failed: 0, stopped: false, redispatched: 2 }
    ]);
  });

  it("re-dispatches after the line's own work, in the same tick", async () => {
    const waiting = waitingRun({ legacyAskerId: "legacy:a" });
    const stalled = randomUUID();
    const { application, dispatched } = arrange({ pages: [[waiting]], stalled: [stalled] });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, redispatched: 1 });
    expect(dispatched).toEqual([waiting.runId, stalled]);
  });

  it("hands the same job over at most once per bound from this process, then again once the bound has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T09:00:00.000Z") });
    const stalled = randomUUID();
    const { application, dispatched } = arrange({ pages: [], stalled: [stalled] });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ redispatched: 1 });
    vi.setSystemTime(new Date("2026-10-01T09:04:59.999Z"));
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ redispatched: 0 });
    vi.setSystemTime(new Date("2026-10-01T09:05:00.000Z"));
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ redispatched: 1 });
    expect(dispatched).toEqual([stalled, stalled]);
  });

  it("logs a failed re-dispatch by code, never records the run FAILED, and tries again on the next tick", async () => {
    const stalled = randomUUID();
    const { application, dispatched, recorded, lines } = arrange({
      pages: [], stalled: [stalled], dispatchFails: new Set([stalled])
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ redispatched: 0, failed: 0 });
    expect(recorded).toEqual([]);
    expect(lines()).toEqual([{ event: "api.wait.redispatch_failed", runId: stalled, diagnostic: expect.any(String) }]);
    expect(JSON.stringify(lines())).not.toContain("test: ");
    await application.wakeWaitingRuns();
    // Not remembered as handed over: the next tick tries again.
    expect(lines().filter((line) => line.event === "api.wait.redispatch_failed")).toHaveLength(2);
    expect(dispatched).toEqual([]);
  });
});

describe("side-by-side C4: a stalled start whose release no longer serves it", () => {
  it("is logged, counted nowhere, never recorded FAILED again, and not remembered as handed over", async () => {
    const stalled = randomUUID();
    const { application, dispatched, recorded, lines } = arrange({ pages: [], stalled: [stalled], notServed: new Set([stalled]) });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 0, started: 0, skipped: 0, failed: 0, stopped: false, redispatched: 0 });
    expect(recorded).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(lines()).toEqual([{ event: "api.wait.release_not_served", runId: stalled, releaseKey: "r16-0123456789ab", closed: true }]);
  });
});

describe("B7b AskRoom.startWaiting decides like an admission, under the same locks", () => {
  function room(input: {
    daySpent?: number;
    ownerSpent?: number;
    waiting?: boolean;
    failAt?: "hold" | "started" | "superseded";
    entitlements?: AskRoomEntitlements | null;
    withPlans?: boolean;
    /** Side-by-side C8/C11: the release gate (this release current, nothing live unless said). */
    gate?: AskAdmissionGate;
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
          // 0123's trigger, as pg reports it: SQLSTATE 23514, MESSAGE RUN_SUPERSEDED.
          if (input.failAt === "superseded") throw Object.assign(new Error("RUN_SUPERSEDED"), { code: "23514" });
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
      clock: () => NOW,
      ...(input.gate === undefined ? {} : { gate: input.gate })
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
    expect(outcome).toEqual({ kind: "STARTED", runId: run.runId, value: "job:1" });
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

  /** Side-by-side C11: the gate of the current release, r17; nothing live. */
  const gate: AskAdmissionGate = {
    releaseKey: ["r17", "0123456789ab"].join("-"), siteConcurrentDebates: 8,
    ownReleaseIsCurrent: async () => true, activeDebates: async () => 0
  };
  const stale = waitingRun({ ownerRef: OWNER }, { releaseKey: OLD_RELEASE });
  function readmitPlan(overrides: Partial<Extract<ReadmissionPlan, { kind: "READMIT" }>> = {}): Extract<ReadmissionPlan, { kind: "READMIT" }> {
    return Object.freeze({
      kind: "READMIT" as const, ask: {} as never, shapePlan: "free" as const, planId: null, evaluation: {} as never,
      settingsClass: Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 }),
      holdMicros: null, stored: storedAsk(stale.runId), ...overrides
    });
  }

  it("side-by-side C11: a run another release admitted, which the room would START, is NEEDS_READMISSION and nothing is written", async () => {
    const { askRoom, writes, reasons, statements } = room({ gate });
    await expect(askRoom.startWaiting(stale, never)).resolves.toEqual({ kind: "NEEDS_READMISSION", planId: null });
    expect(writes).toEqual([]);
    expect(reasons).toEqual([]);
    expect(statements.at(-1)).toBe("COMMIT");
    // Without a gate (today's single-release world) the release is never compared: it starts as before.
    const plain = room({});
    await expect(plain.askRoom.startWaiting(stale, async () => "job:1")).resolves.toEqual({ kind: "STARTED", runId: stale.runId, value: "job:1" });
  });

  it("side-by-side C11: a closed room answers as today for a run another release admitted, and asks for no plan", async () => {
    await expect(room({ gate, daySpent: 100_000 }).askRoom.startWaiting(stale, never)).resolves.toEqual({ kind: "SITE_FULL" });
    const busy = room({ gate: { ...gate, activeDebates: async () => 8 } });
    await expect(busy.askRoom.startWaiting(stale, never)).resolves.toEqual({ kind: "SITE_BUSY" });
    expect(busy.reasons).toEqual([{ runId: stale.runId, waitsFor: "SITE_BUSY", personRecheckAt: null, at: NOW }]);
  });

  it("side-by-side C11: READMIT on START creates the new run, then writes the edge, its hold, and queues ITS first job last", async () => {
    const { askRoom, writes, statements, client } = room({ gate });
    const createRun = vi.fn(async () => { writes.push("createRun"); return "new-run"; });
    let given: unknown = null;
    const outcome = await askRoom.startWaiting(stale, async (tx, runId) => {
      given = tx;
      writes.push(`enqueue:${runId}`);
      return "job:new";
    }, { plan: readmitPlan(), createRun });
    expect(outcome).toEqual({ kind: "STARTED", runId: "new-run", value: "job:new" });
    // The old run is never marked started: the edge takes it out of the line.
    expect(writes).toEqual(["createRun", "hold:700", "enqueue:new-run"]);
    expect(given).toBe(client);
    const edge = statements.findIndex((text) => text.includes("INSERT INTO core.run_supersession"));
    expect(edge).toBeGreaterThan(-1);
    expect(statements[edge]).toContain("'READMITTED'");
    expect(client.query.mock.calls[edge]?.[1]).toEqual([stale.runId, "new-run"]);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("side-by-side C11: the hold is the plan's picked figure when it has one", async () => {
    const { askRoom, writes } = room({ gate });
    await askRoom.startWaiting(stale, async () => "job:new", { plan: readmitPlan({ holdMicros: 123 }), createRun: async () => "new-run" });
    expect(writes).toEqual(["hold:123"]);
  });

  it("side-by-side C11: a plan made for another billing plan is NEEDS_READMISSION again, with the plan read under the lock", async () => {
    const entitlements: AskRoomEntitlements = { current: async () => ({ planId: "PLUS", eventId: EVENT }), recordRunChargeScope: async () => undefined };
    const { askRoom, writes } = room({ gate, entitlements, withPlans: true });
    const createRun = vi.fn(async () => "new-run");
    await expect(askRoom.startWaiting(stale, never, { plan: readmitPlan({ planId: "FREE" }), createRun }))
      .resolves.toEqual({ kind: "NEEDS_READMISSION", planId: "PLUS" });
    expect(createRun).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("side-by-side C11: ASK_AGAIN on START answers ASK_AGAIN and writes nothing; a closed room answers as today", async () => {
    const createRun = vi.fn(async () => "never");
    const { askRoom, writes } = room({ gate });
    await expect(askRoom.startWaiting(stale, never, { plan: { kind: "ASK_AGAIN" }, createRun })).resolves.toEqual({ kind: "ASK_AGAIN" });
    expect(writes).toEqual([]);
    await expect(room({ gate, daySpent: 100_000 }).askRoom.startWaiting(stale, never, { plan: { kind: "ASK_AGAIN" }, createRun }))
      .resolves.toEqual({ kind: "SITE_FULL" });
    await expect(room({ gate, daySpent: 100_000 }).askRoom.startWaiting(stale, never, { plan: readmitPlan(), createRun }))
      .resolves.toEqual({ kind: "SITE_FULL" });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("side-by-side C11: a start refused because the run was superseded meanwhile is the typed RUN_SUPERSEDED, rolled back", async () => {
    const { askRoom, statements } = room({ failAt: "superseded" });
    const enqueue = vi.fn(async () => "job:never");
    await expect(askRoom.startWaiting(run, enqueue)).rejects.toMatchObject({ code: "RUN_SUPERSEDED", name: "TypedDomainError" });
    expect(enqueue).not.toHaveBeenCalled();
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("side-by-side C11: a failure after the new run was created rolls the START back: no edge, no hold, no job", async () => {
    const { askRoom, statements } = room({ gate, failAt: "hold" });
    const enqueue = vi.fn(async () => "job:never");
    await expect(askRoom.startWaiting(stale, enqueue, { plan: readmitPlan(), createRun: async () => "new-run" }))
      .rejects.toThrow(/^test: the hold was refused$/u);
    expect(enqueue).not.toHaveBeenCalled();
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("starts an upgraded Free run, and a run whose plan moved between paid plans, pinned to the entitlement it checked", async () => {
    for (const [planTier, planId] of [["free", "PLUS"], ["premium", "MAX"], ["free", "FREE"]] as const) {
      const current = vi.fn(async () => ({ planId, eventId: EVENT }));
      const scopes: unknown[] = [];
      const entitlements: AskRoomEntitlements = { current, recordRunChargeScope: async (_tx, scope) => { scopes.push(scope); } };
      const { askRoom } = room({ entitlements, withPlans: true });
      const waiting = waitingRun({ ownerRef: OWNER }, { planTier });
      await expect(askRoom.startWaiting(waiting, async () => "job:1")).resolves.toEqual({ kind: "STARTED", runId: waiting.runId, value: "job:1" });
      // Read ONCE: the plan the tier was checked against is the plan the run is pinned to.
      expect(current).toHaveBeenCalledTimes(1);
      expect(scopes).toEqual([{ runId: waiting.runId, ownerRef: OWNER, planId, entitlementEventId: EVENT, admittedAt: NOW }]);
    }
  });
});
