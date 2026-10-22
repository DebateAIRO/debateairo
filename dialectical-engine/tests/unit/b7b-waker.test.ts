import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import {
  PostgresAskApplication, ReleaseNotServedError, type AskModelPickerSettings, type AskTargetFacts, type RunCreationSettings
} from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember, type StoredAsk, type WaitingRun } from "@debateai/db";
import { DEBATE_ROLES, TypedDomainError } from "@debateai/kernel";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis } from "@debateai/register";
import type { PickerSettings } from "@debateai/scorecard";
import { ServeRepository } from "@debateai/serve";
import {
  AskRoom,
  type AskAdmissionGate,
  type AskRoomEntitlements,
  type AskWaitingLinePort,
  type Readmission,
  type RoomPreview,
  type WaitingStart
} from "../../apps/api/src/ask-room.js";
import type { ReadmissionPlan } from "../../apps/api/src/readmission.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { economyCaps, roleNumbers, testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";

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

/**
 * Side-by-side C11 review: an owner ask-admission pool whose lease is taken ("lease") and given back ("release") into
 * `events`, so a case can tell what ran under it; `unlockFails` makes the release refuse (its unlock answers false).
 */
function leasePool(events: string[], unlockFails: boolean): Pool {
  const query = vi.fn(async (text: string) => {
    if (text.includes("pg_advisory_unlock")) {
      events.push("release");
      return { rows: [{ unlocked: !unlockFails }], rowCount: 1 } as unknown as QueryResult;
    }
    if (text.includes("pg_advisory_lock")) events.push("lease");
    return { rows: [{ locked: true }], rowCount: 1 } as unknown as QueryResult;
  });
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
/**
 * Side-by-side C11: one answer of the fake line per `startWaiting` call, in order. TAKEN: 0123 refused the re-admission's
 * key provision (an earlier one of the run is pending or alive), nothing written. `startAs`: STARTED — for a READMIT
 * plan the new run is written first, as the room does (`createRun`), and that run starts.
 */
type Step = "NEEDS_READMISSION" | "ASK_AGAIN" | "TAKEN" | "SITE_FULL" | Readonly<{ startAs: string }>;

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
  /** Side-by-side C11 review: what phase one's NEEDS_READMISSION carries — the room as measured under the lock. */
  readonly preview?: RoomPreview;
  /** Side-by-side C11 review: per old run, its re-admissions whose START never committed (0123's reader). */
  readonly orphans?: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Side-by-side C11 review: the owner lease's release fails after what ran under it. */
  readonly unlockFails?: boolean;
  /** Settings a case adds (a planner that can READMIT, a model picker). */
  readonly extra?: Partial<RunCreationSettings>;
}) {
  let pages = input.pages;
  const tried: string[] = [];
  const readmissions: Array<Readmission | undefined> = [];
  const dispatched: string[] = [];
  const recorded: unknown[] = [];
  const storedReads: string[] = [];
  /** Side-by-side C11 review: the line's starts, the owner lease and the orphan reads, in the order they happened. */
  const events: string[] = [];
  vi.spyOn(RunRepository.prototype, "readStoredAsk").mockImplementation(async (runId) => {
    storedReads.push(runId);
    if (input.stored === undefined) throw new Error("test: no stored ask was expected to be read");
    return input.stored(runId);
  });
  vi.spyOn(RunRepository.prototype, "listUnstartedReadmissions").mockImplementation(async (runId) => {
    events.push(`orphans:${runId}`);
    return input.orphans?.[runId] ?? [];
  });
  // Side-by-side C11: a READMIT's new run, as `#readmit` writes it (the row, then the memory question).
  vi.spyOn(RunRepository.prototype, "startReadmittedRun").mockImplementation(async ({ fromRunId }) => `new:${fromRunId}`);
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined as never);
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
      events.push(`start:${run.runId}`);
      const outcome = input.outcomes?.[run.runId];
      if (outcome === "THROW") throw new Error("test: the start's transaction failed");
      if (outcome !== undefined) return { kind: outcome };
      const typed = input.typedThrow?.[run.runId];
      if (typed !== undefined) throw new TypedDomainError(typed, "test: typed refusal");
      const step = input.steps?.[run.runId]?.[call];
      if (step === "NEEDS_READMISSION") {
        return { kind: "NEEDS_READMISSION", planId: null, ...(input.preview === undefined ? {} : { preview: input.preview }) };
      }
      if (step === "ASK_AGAIN") return { kind: "ASK_AGAIN" };
      if (step === "SITE_FULL") return { kind: "SITE_FULL" };
      if (step === "TAKEN") throw new TypedDomainError("RUN_READMISSION_TAKEN", "test: an earlier re-admission is pending or alive");
      if (step !== undefined) {
        const started = readmission?.plan.kind === "READMIT" ? await readmission.createRun() : step.startAs;
        return { kind: "STARTED", runId: started, value: await enqueue(TX, started) };
      }
      return { kind: "STARTED", runId: run.runId, value: await enqueue(TX, run.runId) };
    }
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "b7b", settlementWatchHandle: "b7b",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    ...input.extra,
    waitingLine
  };
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async ({ runId, workItemId }) => {
      if (input.dispatchFails?.has(runId) === true) throw new Error("test: the job system refused");
      if (input.notServed?.has(runId) === true) throw new ReleaseNotServedError(runId, ["r16", "0123456789ab"].join("-"), true);
      if (workItemId !== `job:${runId}`) throw new Error("test: dispatched a job the tick did not queue");
      dispatched.push(runId);
    }) },
    settings, { read: async () => [] }, stubPool(),
    { server: leasePool(events, input.unlockFails === true), legacy: leasePool(events, input.unlockFails === true) }
  );
  const lines = () => [...info.mock.calls, ...error.mock.calls].map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  const setPages = (next: ReadonlyArray<ReadonlyArray<WaitingRun>>) => { pages = next; };
  return { application, tried, readmissions, dispatched, recorded, reads, lines, setPages, stalledAsked, storedReads, events };
}

/** Side-by-side C11 review: what the waker records for a re-admission that never started (the orphan path). */
const readmissionFailure = (runId: string) =>
  ({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION" });

/**
 * Side-by-side C11 review: settings under which a stored free ask plans READMIT — every roster model discovered, each of
 * its own maker, and a structural ceiling for the panel — as tests/integration/side-by-side-readmission.test.ts does.
 */
function readmittable(): Partial<RunCreationSettings> {
  const models = [...new Set([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium])];
  return {
    resolveDiscoveredPanel: async () => models.map((modelId, index) => Object.freeze({
      provider_ref: `provider:b7b:${String(index + 1)}`, maker: `maker:b7b:${String(index + 1)}`, model_id: modelId,
      probe_evidence_ref: `probe:b7b:${String(index + 1)}`, probed_at: "2026-10-01T00:00:00.000Z"
    })),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1)
  };
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
    expect(lines()).toContainEqual({ event: "api.wait.release_not_served", runId: a.runId, releaseKey: ["r16", "0123456789ab"].join("-"), closed: true });
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

  /**
   * C11 review, Important (controller ruling 2026-10-22): a re-admission whose row committed while its START did not
   * (the process died in between, or its FAILED record never landed) must never strand the debate. Under the old run's
   * owner lease no START of that person is in flight, so every re-admission 0123 lists as unstarted is an orphan.
   */
  it("TAKEN in phase two: each unstarted re-admission of the owner's run is recorded FAILED under the lease, then skipped", async () => {
    const a = waitingRun({ ownerRef: OWNER }, { releaseKey: OLD_RELEASE });
    const { application, events, recorded, dispatched, lines } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", "TAKEN"] }, extra: readmittable(),
      stored: (runId) => storedAsk(runId, { askerId: `owner:${OWNER}`, contentEncrypted: true }),
      orphans: { [a.runId]: ["orphan-1", "orphan-2"] }
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 0, skipped: 1, failed: 0, stopped: false, redispatched: 0 });
    expect(events).toEqual([`start:${a.runId}`, "lease", `start:${a.runId}`, `orphans:${a.runId}`, "release"]);
    expect(recorded).toEqual([readmissionFailure("orphan-1"), readmissionFailure("orphan-2")]);
    expect(dispatched).toEqual([]);
    expect(lines()).toContainEqual({ event: "api.wait.readmission_orphan", runId: a.runId, newRunId: "orphan-1" });
    expect(lines()).toContainEqual({ event: "api.wait.readmission_orphan", runId: a.runId, newRunId: "orphan-2" });
    expect(lines()).toContainEqual({ event: "api.wait.readmission_skipped", runId: a.runId, code: "RUN_READMISSION_TAKEN" });
  });

  it("an owner's re-admission that starts reads no orphans: TAKEN is what reveals one", async () => {
    const a = waitingRun({ ownerRef: OWNER }, { releaseKey: OLD_RELEASE });
    const { application, events, recorded, dispatched } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", { startAs: "unused" }] }, extra: readmittable(),
      stored: (runId) => storedAsk(runId, { askerId: `owner:${OWNER}`, contentEncrypted: true })
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(events).toEqual([`start:${a.runId}`, "lease", `start:${a.runId}`, "release"]);
    expect(recorded).toEqual([]);
    expect(dispatched).toEqual([`new:${a.runId}`]);
  });

  it("a legacy asker's unstarted re-admission is recorded FAILED under the lease before the room is asked again; the run is re-admitted", async () => {
    // A legacy re-admission is never refused TAKEN (it provisions no key), so its orphan is looked for first.
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const { application, events, recorded, dispatched, lines } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", { startAs: "unused" }] }, extra: readmittable(),
      stored: (runId) => storedAsk(runId), orphans: { [a.runId]: ["orphan-1"] }
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 1, skipped: 0, failed: 0, stopped: false, redispatched: 0 });
    expect(events).toEqual([`start:${a.runId}`, "lease", `orphans:${a.runId}`, `start:${a.runId}`, "release"]);
    expect(recorded).toEqual([readmissionFailure("orphan-1")]);
    expect(dispatched).toEqual([`new:${a.runId}`]);
    expect(lines()).toContainEqual({ event: "api.wait.readmission_orphan", runId: a.runId, newRunId: "orphan-1" });
  });

  it("side-by-side §13 (S10): a re-admission is planned and stamped on one version read through the per-version path", async () => {
    // S10/S13 boundary: the plan's evaluation, the new row's register version and its memory question's policy version all
    // come from the settings `askSettingsOf` hands it (here the pointer names 2 over the site version 1); S13 owns the
    // re-admission condition and the pointer read on the START transaction.
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const pointer = vi.fn(async () => 2);
    const versionTwo: Pick<RunCreationSettings, "registerVersion" | "resolveEnvelopeBasis" | "resolveRisk"> = {
      registerVersion: 2,
      resolveEnvelopeBasis: async ({ panelSize }) => ({ ...fixtureStructuralCeiling(12, panelSize, 1), version_mark: 2 }),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) =>
        ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef: `${tierProvenanceRef}:v2` })
    };
    const { application, dispatched } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", { startAs: "unused" }] },
      extra: { ...readmittable(), admissionSettings: { activeSettingsVersion: pointer, admissionSettingsFor: async () => versionTwo } },
      stored: (runId) => storedAsk(runId)
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(dispatched).toEqual([`new:${a.runId}`]);
    const row = vi.mocked(RunRepository.prototype.startReadmittedRun).mock.calls[0]![0];
    expect(row).toMatchObject({ fromRunId: a.runId, registerVersion: 2, tierProvenanceRef: "asker:b7b:v2", releaseKey: TEST_RELEASE_KEY });
    expect(row.envelopeBasis).toMatchObject({ version_mark: 2 });
    expect(vi.mocked(ServeRepository.prototype.recordMemoryQuestion).mock.calls[0]![0]).toMatchObject({ policyVersion: 2 });
    expect(pointer).toHaveBeenCalledTimes(1);
  });

  it("a START that committed is never recorded FAILED when the lease's release then fails: its job is handed over later", async () => {
    // C11 review, Minor 3: the new run supersedes the old one (edge, hold and READY job committed); FAILED would end the
    // debate. #redispatchStalledStarts hands its READY job over once it has stalled.
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    const { application, recorded, dispatched, lines } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", { startAs: "unused" }] }, extra: readmittable(),
      stored: (runId) => storedAsk(runId), unlockFails: true
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 0, skipped: 0, failed: 1, stopped: false, redispatched: 0 });
    expect(recorded).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(lines()).toContainEqual({
      event: "api.wait.readmission_release_failed", runId: a.runId, newRunId: `new:${a.runId}`, diagnostic: expect.any(String)
    });
    expect(lines().some((line) => line.event === "api.wait.readmission_failed")).toBe(false);
  });

  it("(control) a START that fails after the new row committed still records that row FAILED", async () => {
    const a = waitingRun({ legacyAskerId: "legacy:a" }, { releaseKey: OLD_RELEASE });
    vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockRejectedValueOnce(new Error("test: the first job could not be queued"));
    const { application, recorded, lines } = arrange({
      pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", { startAs: "unused" }] }, extra: readmittable(),
      stored: (runId) => storedAsk(runId)
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(recorded).toEqual([readmissionFailure(`new:${a.runId}`)]);
    expect(lines()).toContainEqual({
      event: "api.wait.readmission_failed", runId: a.runId, newRunId: `new:${a.runId}`, diagnostic: expect.any(String)
    });
  });

  /**
   * C11 review, Minor 2: phase two plans the new run inside the person's room exactly as `#submitWithRoom` does
   * (`personRoomOf(preview)`), the room phase one measured under the lock, so the picker can step down to fit it. The
   * cast is tests/unit/s4b-free-cost-cap.test.ts's A5 cast: no strength fits a 10-micro room, so a plan made inside it
   * starts person-room-tight (A5), and one made with no room does not.
   */
  describe("the person's room reaches the picker", () => {
    const [FREE_A, FREE_B] = PLAN_TIER_ROSTERS.free;
    const [PAID_A] = PLAN_TIER_ROSTERS.premium;
    const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
      provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-01T00:00:00.000Z"
    });
    const PANEL = Object.freeze([
      member("provider:b7b:paid", "OpenAI", PAID_A!), member("provider:b7b:free-a", "OpenAI", FREE_A!),
      member("provider:b7b:free-b", "Anthropic", FREE_B!)
    ]);
    const MICROS_PER_CALL = new Map<string, number>([[FREE_A!, 100], [FREE_B!, 250], [PAID_A!, 50]]);
    const QUALITY = new Map<string, number>([[FREE_A!, 85], [FREE_B!, 92], [PAID_A!, 99]]);
    const candidates = PANEL.map((entry) => testCandidate(entry.model_id, entry.maker, { modelId: entry.model_id }));
    const caps = (micros: number) => Object.fromEntries(DEBATE_ROLES.map((role) => [role, { moneyMicrosPerCall: micros }]));
    const scorecard = testScorecard(candidates, Object.fromEntries(DEBATE_ROLES.map((role) => [
      role, candidates.map((candidate) => testEntry(candidate.candidateId, QUALITY.get(candidate.modelId)!, 10))
    ])), {
      diversityShare: 0.2,
      planStrengthCaps: { free: "ECONOMY" },
      economyCap: economyCaps(Object.fromEntries(DEBATE_ROLES.map((role) => [role, { moneyMicrosPerCall: 300, secondsPerCall: 300 }]))),
      freeCap: caps(150) as NonNullable<PickerSettings["freeCap"]>
    });
    const CEILING = 50_000_000;
    function hosted(log: (line: string) => void): Partial<RunCreationSettings> {
      const modelPicker: AskModelPickerSettings = Object.freeze({
        scorecard: Object.freeze({ state: "VALID" as const, scorecard, sourceRef: "test:b7b" }),
        mode: "HOSTED" as const,
        // One testEntry call is 1000 input tokens: `micros * 1000` per million tokens costs `micros` a call.
        targetFacts: new Map<string, AskTargetFacts>(PANEL.map((entry) => [entry.provider_ref, Object.freeze({
          thinkingLevels: Object.freeze([]), contextWindowTokens: null,
          price: Object.freeze({ inputMicrosPerMTok: MICROS_PER_CALL.get(entry.model_id)! * 1000, outputMicrosPerMTok: 0 })
        })])),
        perRunCeilingMicros: CEILING,
        moneyPolicy: Object.freeze({ perRunCeilingMicros: CEILING }),
        runMaximumMicros: CEILING,
        answerTokenCeilings: roleNumbers({}, 2048),
        plansSold: true,
        log
      });
      return {
        modelPicker,
        resolveDiscoveredPanel: async () => PANEL,
        resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) => computeStructuralCeilingBasis({
          judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1, finalRetryAttempts: 1,
          branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
          synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5,
          panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned
        })
      };
    }
    /** Phase one's START for an owner whose day window holds 10 micros. */
    const tinyRoom: RoomPreview = Object.freeze({
      admission: Object.freeze({ kind: "START" as const, worst: "FITS" as const, worstScope: null }),
      estimateMicros: 700,
      now: NOW,
      personUses: Object.freeze([Object.freeze({
        scope: "PERSON_DAY" as const, limitMicros: 10, usedMicros: 0, resetsAt: new Date("2026-10-02T00:00:00.000Z"), closeBasisPoints: 9_500
      })]),
      waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null })
    });

    async function planned(preview: RoomPreview | undefined) {
      const a = waitingRun({ ownerRef: OWNER }, { releaseKey: OLD_RELEASE });
      const picker: string[] = [];
      const { application, readmissions } = arrange({
        pages: [[a]], steps: { [a.runId]: ["NEEDS_READMISSION", "SITE_FULL"] }, extra: hosted((line) => picker.push(line)),
        stored: (runId) => storedAsk(runId, { askerId: `owner:${OWNER}`, contentEncrypted: true }),
        ...(preview === undefined ? {} : { preview })
      });
      await application.wakeWaitingRuns();
      const plan = readmissions[1]?.plan;
      if (plan?.kind !== "READMIT") throw new Error(`test: expected a READMIT plan, got ${String(plan?.kind)}`);
      return { evaluation: plan.evaluation, picker };
    }

    it("plans inside the room phase one measured: nothing fits 10 micros, so it starts person-room-tight", async () => {
      const { evaluation, picker } = await planned(tinyRoom);
      expect(evaluation.personRoomTight).toBe(true);
      expect(picker).toContain("MODEL_PICKER note PERSON_ROOM_BELOW_ECONOMY");
    });

    it("(control) with no person room measured, the same plan is not person-room-tight", async () => {
      const { evaluation, picker } = await planned(undefined);
      expect(evaluation.personRoomTight).toBe(false);
      expect(picker).not.toContain("MODEL_PICKER note PERSON_ROOM_BELOW_ECONOMY");
    });
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
    expect(lines()).toEqual([{ event: "api.wait.release_not_served", runId: stalled, releaseKey: ["r16", "0123456789ab"].join("-"), closed: true }]);
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
        // Side-by-side C11 review: the supersession edge joins the start's writes, in the order they happen.
        if (text.includes("INSERT INTO core.run_supersession")) writes.push(`edge:${String(values[0])}->${String(values[1])}`);
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
    // C11 review, Minor 2: with the room as measured under the lock — the owner's windows — for the plan's picker.
    await expect(askRoom.startWaiting(stale, never)).resolves.toEqual({
      kind: "NEEDS_READMISSION", planId: null,
      preview: {
        admission: expect.objectContaining({ kind: "START" }), estimateMicros: 700, now: NOW,
        personUses: [{ scope: "PERSON_MONTH", limitMicros: 1_000, usedMicros: 0, resetsAt: MONTH_RESET, closeBasisPoints: 9_500 }],
        waitReason: { waitsFor: "SITE", personRecheckAt: null }
      }
    });
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
    // The old run is never marked started: the edge takes it out of the line. One ordered list: the new run, its edge,
    // its hold, its first job.
    expect(writes).toEqual(["createRun", `edge:${stale.runId}->new-run`, "hold:700", "enqueue:new-run"]);
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
    expect(writes).toEqual([`edge:${stale.runId}->new-run`, "hold:123"]);
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
