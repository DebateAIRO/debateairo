/**
 * V4 start step, Task 39 (spec 2026-11-03 §4.2; side-by-side spec 2026-10-21 §4, O3): a path debate that waited in line
 * across an upload is re-admitted with the paths its person chose, or asked again — never started without them.
 *
 *  - The plan (`planReadmission`) reads the waiting run's sealed set: its count and source are the start the new release
 *    prices (receipt v2). A set this version no longer offers is ASK_AGAIN, before any probe: the start step off for the
 *    person (no widths), more paths than How wide's widest (a menu's or a dig's picks alike), or more than 3 paths on Free.
 *    Task 39b (owner answer Q8, 4 Nov): Start's rule, so a menu whose width How wide no longer offers is kept as chosen
 *    when its paths fit. A set whose new evaluation is not receipt v2 (one maker on the panel) is ASK_AGAIN too.
 *  - Without a set, the run builds its own list at the default width where the step runs (RUN_BUILT), and no start where
 *    it does not (today's re-admission: `evaluate` is called exactly as C10 calls it, with no start argument).
 *  - The carry-on box (`carry_on_to_report`) stays on the new run only on receipt v2.
 *  - The new run (`#readmit`): the set is sealed again under its own key (`copyStartPathsForReadmission`), then the waiting
 *    run's purpose lines are recorded for it, both before the memory question; a copy that does not find what the plan read
 *    (a planned set gone, or a set where the plan read none) fails the new run (RUN_SETUP_FAILED:READMISSION) and the old
 *    run waits on, to be planned again.
 * Made-up question, paths and lines; no real figure anywhere.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const parent = vi.hoisted(() => ({ reads: [] as unknown[], lines: null as unknown }));

vi.mock("../../apps/api/src/purpose-lines.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/api/src/purpose-lines.js")>()),
  // The waiting run's lines, opened under its key: what a re-admitted path debate keeps.
  readPurposeLinesOf: async (_pool: unknown, ownerRef: string, runId: string) => {
    parent.reads.push({ ownerRef, runId });
    return parent.lines;
  }
}));

import { AskRefusal, PostgresAskApplication, type PlannedAskAdmission, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, PathId, PurposeLines } from "@debateai/contract";
import {
  RunRepository, type DiscoveredPanelMember, type StartPathsStore, type StoredAsk, type StoredStartPath, type StoredStartPathSet,
  type WaitingRun
} from "@debateai/db";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues,
  isShapeReceiptV2, lengthGuidancePolicyStartValues, type DebateShapePlanKey, type DebateShapePolicy, type DebateShapeWidths
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskWaitingLinePort, Readmission, WaitingStart } from "../../apps/api/src/ask-room.js";
import { askShapesForPanel, type AskStartShape } from "../../apps/api/src/debate-shape-ask.js";
import type { PurposeLinesPort } from "../../apps/api/src/purpose-lines.js";
import { planReadmission, readmittedAskContract, type ReadmissionPlan } from "../../apps/api/src/readmission.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const OLD_RUN = "11111111-1111-4111-8111-111111111111";
const NEW_RUN = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const OLD_RELEASE = ["r16", "0123456789ab"].join("-");
const TX = Object.freeze({ marker: "the start's own transaction" }) as unknown as PoolClient;
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
/** The switch on (Task 11). */
const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const FREE: DebateShapeWidths = Object.freeze({ options: Object.freeze([3]), default: 3 });
const PAID: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5, 7]), default: 5 });

const Q = "Should our village keep its small school open?";
const LINES: PurposeLines = Object.freeze({ place: "A village in the hills", time: "Before next autumn" });

function stored(overrides: Partial<StoredAsk> = {}): StoredAsk {
  return Object.freeze({
    runId: OLD_RUN, releaseKey: OLD_RELEASE, registerVersion: 16, questionLine: Q,
    askContract: Object.freeze({ decision_scope: "start paths readmission", steering_presets: Object.freeze([]),
      steering_annotations: Object.freeze([]), critic_unavailable_cap: Object.freeze({ applied: false }) }),
    askerId: `owner:${OWNER_REF}`, sessionId: "33333333-3333-4333-8333-333333333333", callerScope: "ASKER",
    asOf: new Date("2026-11-04T09:00:00.000Z"), askerRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:readmission",
    compositionBudgetTier: "low", planTier: "free", depthParams: Object.freeze({ depth: 1 }), argumentLanguageTag: "en",
    argumentLanguageName: "English", contentEncrypted: true, ...overrides
  });
}

const pathOf = (no: number): StoredStartPath => Object.freeze({
  pathId: `b${no}` as PathId, pathNo: no, author: "AI_SUGGESTION" as const, title: `Path ${String(no)}`, question: `What does path ${String(no)} weigh?`,
  viewpoints: Object.freeze([{ viewpointId: `pt1${String(no)}`, pickNo: null, title: `Path ${String(no)}`, question: `What does path ${String(no)} weigh?`, own: false }]),
  ownWords: Object.freeze([])
});
/** A set the waiting run sealed: MENU, How wide 3, two paths chosen. */
const setOf = (extra: Partial<StoredStartPathSet> & Readonly<{ count?: number }> = {}): StoredStartPathSet => {
  const { count = 2, ...rest } = extra;
  return Object.freeze({ runId: OLD_RUN, source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false,
    paths: Object.freeze(Array.from({ length: count }, (_, index) => pathOf(index + 1))), menu: null, ...rest });
};

/** A receipt as admission mints it for `makers` makers: v2 with a start and two makers or more, today's otherwise. */
function basisFor(ask: AskRequest, plan: DebateShapePlanKey, start: AskStartShape | null, makers = 2): Readonly<Record<string, unknown>> {
  const { shape, shapeV2 } = askShapesForPanel(POLICY_ON, ask.depth_params, plan, makers, start);
  return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: makers, depth: 1, backupSequencesProvisioned: 0,
    ...(shape === null ? {} : { shape }), ...(shapeV2 === null ? {} : { shapeV2 }) });
}

function admission(envelopeBasis: Readonly<Record<string, unknown>>): PlannedAskAdmission {
  return Object.freeze({
    risk: Object.freeze({ effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:readmission" }),
    envelopeBasis, discoveredPanel: Object.freeze([]), criticUnavailableCap: Object.freeze({ applied: false })
  }) as unknown as PlannedAskAdmission;
}

/** The plan's `evaluate`: the start only when there is one (absent: today's call, exactly as C10 made it). */
type Evaluate = (ask: AskRequest, shapePlan: DebateShapePlanKey, start?: AskStartShape) => Promise<PlannedAskAdmission | AskRefusal>;

function plan(input: Readonly<{
  stored?: StoredAsk; planId?: "FREE" | "PLUS" | "PRO" | "MAX" | null; set?: StoredStartPathSet | null;
  widths?: DebateShapeWidths | null; makers?: number; evaluate?: Evaluate;
}> = {}) {
  const evaluate = vi.fn<Evaluate>(input.evaluate
    ?? (async (ask, shapePlan, start) => admission(basisFor(ask, shapePlan, start ?? null, input.makers))));
  const startWidths = vi.fn((_plan: DebateShapePlanKey) => input.widths === undefined ? FREE : input.widths);
  const result = planReadmission({
    stored: input.stored ?? stored(), planId: input.planId ?? null,
    settings: { debateShapePolicy: POLICY_ON, lengthGuidancePolicy: lengthGuidancePolicyStartValues() },
    evaluate, startPaths: input.set ?? null, startWidths
  });
  return { result, evaluate, startWidths };
}

function readmitted(value: ReadmissionPlan): Extract<ReadmissionPlan, { kind: "READMIT" }> {
  if (value.kind !== "READMIT") throw new Error(`expected READMIT, got ${JSON.stringify(value)}`);
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("planReadmission keeps the chosen paths (Task 39)", () => {
  it("READMIT with the stored set's count and source: the new evaluation prices them, and the class counts them", async () => {
    const set = setOf();
    const { result, evaluate, startWidths } = plan({ set });
    const value = readmitted(await result);
    expect(startWidths).toHaveBeenCalledWith("free");
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(value.ask, "free", { paths: 2, pathsSource: "MENU" });
    expect(value.start).toEqual({ paths: 2, pathsSource: "MENU" });
    expect(value.startPaths).toBe(set);
    expect(isShapeReceiptV2(value.evaluation.envelopeBasis)).toBe(true);
    expect(value.evaluation.envelopeBasis).toMatchObject({ shape: { paths: 2, paths_source: "MENU" } });
    expect(value.settingsClass.shape?.paths).toBe(2);
  });

  it("a dig's picks keep their source; under How wide's widest they are re-admitted", async () => {
    const value = readmitted(await plan({ stored: stored({ planTier: "premium" }), planId: "PLUS", widths: PAID,
      set: setOf({ source: "DIG_PICKS", width: 6, count: 6 }) }).result);
    expect(value.start).toEqual({ paths: 6, pathsSource: "DIG_PICKS" });
    expect(value.shapePlan).toBe("plus");
  });

  it("ASK_AGAIN, before any probe, when the start step is off for the person (no widths) and the run has a set", async () => {
    const { result, evaluate } = plan({ set: setOf(), widths: null });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  // Task 39b (owner answer Q8, 4 Nov): Start's rule (`startPathsFit`): chosen paths that fit the version's widest are kept
  // as chosen, whatever How wide now offers; the set keeps its width.
  it("a MENU set whose width the version no longer offers is re-admitted when its paths fit the widest", async () => {
    const without5: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 7]), default: 3 });
    const set = setOf({ width: 5, count: 4 });
    const { result, evaluate } = plan({ stored: stored({ planTier: "premium" }), planId: "PLUS", widths: without5, set });
    const value = readmitted(await result);
    expect(value.start).toEqual({ paths: 4, pathsSource: "MENU" });
    expect(evaluate).toHaveBeenCalledWith(value.ask, "plus", { paths: 4, pathsSource: "MENU" });
    expect(value.startPaths).toBe(set);
    expect(value.evaluation.envelopeBasis).toMatchObject({ shape: { paths: 4, paths_source: "MENU" } });
  });

  // Review of Task 39b: the paths chosen decide, not the How wide they were chosen at. Four paths chosen at How wide 7
  // (the AIs found fewer) fit a version whose widest is 5, as at Start.
  it("a MENU set chosen at a How wide above the widest is re-admitted when its paths fit: the count decides", async () => {
    const narrower: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5]), default: 5 });
    const set = setOf({ width: 7, count: 4 });
    const { result, evaluate } = plan({ stored: stored({ planTier: "premium" }), planId: "PLUS", widths: narrower, set });
    const value = readmitted(await result);
    expect(value.start).toEqual({ paths: 4, pathsSource: "MENU" });
    expect(evaluate).toHaveBeenCalledWith(value.ask, "plus", { paths: 4, pathsSource: "MENU" });
    expect(value.startPaths).toBe(set);
  });

  it("ASK_AGAIN, before any probe, when its paths are more than the widest; the control is re-admitted", async () => {
    const narrower: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5]), default: 5 });
    const paid = { stored: stored({ planTier: "premium" }), planId: "PLUS" } as const;
    const { result, evaluate } = plan({ ...paid, widths: narrower, set: setOf({ width: 7, count: 7 }) });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
    expect(readmitted(await plan({ ...paid, widths: PAID, set: setOf({ width: 7, count: 7 }) }).result).start)
      .toEqual({ paths: 7, pathsSource: "MENU" });
  });

  it("ASK_AGAIN, before any probe, when a dig's picks are wider than How wide's widest", async () => {
    const narrower: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5]), default: 5 });
    const { result, evaluate } = plan({ stored: stored({ planTier: "premium" }), planId: "PLUS", widths: narrower,
      set: setOf({ source: "DIG_PICKS", width: 6, count: 6 }) });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("ASK_AGAIN, before any probe, for more than 3 paths on Free, whatever widths the row gives", async () => {
    for (const set of [setOf({ width: 5, count: 4 }), setOf({ source: "DIG_PICKS", width: 4, count: 4 })]) {
      const { result, evaluate } = plan({ widths: PAID, set });
      expect(await result, set.source).toEqual({ kind: "ASK_AGAIN" });
      expect(evaluate).not.toHaveBeenCalled();
    }
  });

  it("ASK_AGAIN when the new evaluation is not receipt v2 (one maker): the chosen paths would be dropped", async () => {
    const { result, evaluate } = plan({ set: setOf(), makers: 1 });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0]![2]).toEqual({ paths: 2, pathsSource: "MENU" });
  });

  it("without a set the run builds its own list at the plan's default width (RUN_BUILT): 5 paid, 3 Free", async () => {
    const paid = plan({ stored: stored({ planTier: "premium" }), planId: "PLUS", widths: PAID });
    const value = readmitted(await paid.result);
    expect(paid.evaluate).toHaveBeenCalledWith(value.ask, "plus", { paths: 5, pathsSource: "RUN_BUILT" });
    expect(value.start).toEqual({ paths: 5, pathsSource: "RUN_BUILT" });
    expect(value.evaluation.envelopeBasis).toMatchObject({ shape: { paths: 5, paths_source: "RUN_BUILT" } });
    expect(value.settingsClass.shape?.paths).toBe(5);
    expect(readmitted(await plan().result).start).toEqual({ paths: 3, pathsSource: "RUN_BUILT" });
  });

  it("without a set, one maker: re-admitted with today's receipt, as submit admits it", async () => {
    const value = readmitted(await plan({ makers: 1 }).result);
    expect(isShapeReceiptV2(value.evaluation.envelopeBasis)).toBe(false);
    expect(value.settingsClass.shape).not.toHaveProperty("paths");
  });

  it("no widths and no set: no start (null), today's receipt and class", async () => {
    const { result, evaluate } = plan({ widths: null });
    const value = readmitted(await result);
    expect(evaluate.mock.calls).toEqual([[value.ask, "free"]]);
    expect(value.start).toBeNull();
    expect(value.startPaths).toBeNull();
    expect(isShapeReceiptV2(value.evaluation.envelopeBasis)).toBe(false);
    expect(value.settingsClass.shape).not.toHaveProperty("paths");
  });

  it("a caller that hands neither a set nor widths gets today's re-admission: no start", async () => {
    const evaluate = vi.fn<Evaluate>(async (ask, shapePlan, start) => admission(basisFor(ask, shapePlan, start ?? null)));
    const value = readmitted(await planReadmission({ stored: stored(), planId: null,
      settings: { debateShapePolicy: POLICY_ON, lengthGuidancePolicy: lengthGuidancePolicyStartValues() }, evaluate }));
    expect(evaluate.mock.calls).toEqual([[value.ask, "free"]]);
    expect(value.start).toBeNull();
  });
});

describe("readmittedAskContract keeps the carry-on box only on receipt v2 (Task 39)", () => {
  const carryOn = stored({ askContract: { ...stored().askContract, carry_on_to_report: true } });

  it("kept on v2", async () => {
    const value = readmitted(await plan({ stored: carryOn, set: setOf({ carryOnToReport: true }) }).result);
    expect(readmittedAskContract(value)).toMatchObject({ carry_on_to_report: true });
    const built = readmitted(await plan({ stored: carryOn }).result);
    expect(readmittedAskContract(built)).toMatchObject({ carry_on_to_report: true });
  });

  it("dropped on today's receipt, and never added when the waiting run did not ask", async () => {
    expect(readmittedAskContract(readmitted(await plan({ stored: carryOn, widths: null }).result))).not.toHaveProperty("carry_on_to_report");
    expect(readmittedAskContract(readmitted(await plan({ stored: carryOn, makers: 1 }).result))).not.toHaveProperty("carry_on_to_report");
    expect(readmittedAskContract(readmitted(await plan({ set: setOf() }).result))).not.toHaveProperty("carry_on_to_report");
  });
});

// ---- The waker: `#startReadmitted` reads the set and plans with it; `#readmit` keeps it, then the lines ----

const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-11-04T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ONE_MAKER = Object.freeze(PANEL.map((seat) => Object.freeze({ ...seat, maker: "OpenAI" })));

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const waiting: WaitingRun = Object.freeze({
  runId: OLD_RUN, waitingSince: new Date("2026-11-04T09:00:00.000Z"), releaseKey: OLD_RELEASE, ownerRef: OWNER_REF, legacyAskerId: null,
  planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2, waitsFor: "SITE", personRecheckAt: null,
  reasonAt: new Date("2026-11-04T09:00:00.000Z")
});

type Waker = Readonly<{ policy?: DebateShapePolicy; panel?: readonly DiscoveredPanelMember[]; set?: StoredStartPathSet | null;
  copy?: "COPIED" | "NONE"; store?: boolean; stored?: StoredAsk; run?: WaitingRun }>;

function arrangeWaker(input: Waker = {}) {
  const order: string[] = [];
  const started: Array<Parameters<RunRepository["startReadmittedRun"]>[0]> = [];
  const copies: unknown[] = [];
  const recordedLines: unknown[] = [];
  const recorded: unknown[] = [];
  const dispatched: string[] = [];
  parent.reads.length = 0;
  parent.lines = LINES;
  vi.spyOn(RunRepository.prototype, "readStoredAsk").mockImplementation(async () => input.stored ?? stored());
  vi.spyOn(RunRepository.prototype, "listUnstartedReadmissions").mockImplementation(async () => []);
  vi.spyOn(RunRepository.prototype, "startReadmittedRun").mockImplementation(async (run) => {
    order.push("startReadmittedRun");
    started.push(run);
    return NEW_RUN;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => { order.push("recordMemoryQuestion"); });
  vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockImplementation(async () => []);
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async (_client, job) => `job:${job.runId ?? ""}`);
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    recorded.push((record as { runId: string; reason: string }));
    return true;
  });
  const startPaths: StartPathsStore = {
    recordStartPaths: async () => { throw new Error("test: a re-admission seals by copy only"); },
    readStartPaths: async (runId) => {
      order.push(`readStartPaths:${runId}`);
      return input.set === undefined ? setOf({ carryOnToReport: true }) : input.set;
    },
    readStartPathIds: async () => null,
    copyStartPathsForReadmission: async (fromRunId, toRunId) => {
      order.push("copyStartPathsForReadmission");
      copies.push({ fromRunId, toRunId });
      return input.copy ?? "COPIED";
    },
    recordCarryOnDue: async () => "NOT_ASKED",
    claimCarryOnDue: async () => [],
    readCarryOnBegun: async () => [],
    recordCarryOnDone: async () => "NOT_BEGUN"
  };
  const purposeLines: PurposeLinesPort = {
    record: async (ownerRef, runId, lines) => {
      order.push("recordPurposeLines");
      recordedLines.push({ ownerRef, runId, lines });
      return "RECORDED";
    }
  };
  let calls = 0;
  const waitingLine: AskWaitingLinePort = {
    wakeCandidates: async ({ after }) => (after === null ? [input.run ?? waiting] : []),
    startWaiting: async <T,>(run: WaitingRun, enqueue: (tx: PoolClient, runId: string) => Promise<T>, readmission?: Readmission):
      Promise<WaitingStart<T>> => {
      calls += 1;
      if (calls === 1) return { kind: "NEEDS_READMISSION", planId: null };
      if (readmission?.plan.kind !== "READMIT") return { kind: "ASK_AGAIN" };
      const runId = await readmission.createRun();
      return { kind: "STARTED", runId, value: await enqueue(TX, runId) };
    }
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:readmission",
    settlementWatchHandle: "watch:readmission",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, shapeV2, length, engine, web }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(shapeV2 == null ? {} : { shapeV2 }), ...(length === null ? {} : { length }),
        ...(engine === null ? {} : { engine }), ...(web === null ? {} : { web }) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    debateShapePolicy: input.policy ?? POLICY_ON,
    lengthGuidancePolicy: lengthGuidancePolicyStartValues(),
    engineVersionPolicy: engineVersionPolicyStartValues(),
    ...(input.store === false ? {} : { startPaths }),
    purposeLines,
    waitingLine
  };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const application = new PostgresAskApplication(stubPool(), { dispatch: vi.fn(async ({ runId }) => { dispatched.push(runId); }) }, settings,
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  const lines = () => errors.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { application, order, started, copies, recordedLines, recorded, dispatched, lines };
}

describe("the waker re-admits a path debate with its paths and lines (Task 39)", () => {
  it("v2: the set is copied to the new run, then the waiting run's lines, both before the memory question", async () => {
    const carryOn = stored({ askContract: { ...stored().askContract, carry_on_to_report: true } });
    const { application, order, started, copies, recordedLines, dispatched } = arrangeWaker({ stored: carryOn });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "copyStartPathsForReadmission", "recordPurposeLines",
      "recordMemoryQuestion"]);
    expect(copies).toEqual([{ fromRunId: OLD_RUN, toRunId: NEW_RUN }]);
    expect(parent.reads).toEqual([{ ownerRef: OWNER_REF, runId: OLD_RUN }]);
    expect(recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: NEW_RUN, lines: LINES }]);
    expect(started).toHaveLength(1);
    expect(isShapeReceiptV2(started[0]!.envelopeBasis)).toBe(true);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2", shape: { plan: "free", paths: 2, paths_source: "MENU" } });
    expect(started[0]!.askContract).toMatchObject({ carry_on_to_report: true });
    expect(started[0]!.principal).toEqual({ kind: "readmitted-owner", ownerRef: OWNER_REF });
    expect(dispatched).toEqual([NEW_RUN]);
  });

  it("v2 without a set (RUN_BUILT): nothing to copy, the lines are kept", async () => {
    const { application, order, recordedLines, started } = arrangeWaker({ set: null, copy: "NONE" });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "copyStartPathsForReadmission", "recordPurposeLines",
      "recordMemoryQuestion"]);
    expect(started[0]!.envelopeBasis).toMatchObject({ shape: { paths: 3, paths_source: "RUN_BUILT" } });
    expect(recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: NEW_RUN, lines: LINES }]);
  });

  it("a set on a one-maker panel: ASK_AGAIN, the waiting run closes CHOICE_UNAVAILABLE and nothing is written", async () => {
    const { application, order, recorded, dispatched } = arrangeWaker({ panel: ONE_MAKER });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`]);
    expect(recorded).toEqual([expect.objectContaining({ runId: OLD_RUN, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE" })]);
    expect(dispatched).toEqual([]);
  });

  it("a set where the start step is off: ASK_AGAIN; no set there: today's re-admission, byte for byte", async () => {
    const off = arrangeWaker({ policy: debateShapePolicyStartValues() });
    await expect(off.application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(off.recorded).toEqual([expect.objectContaining({ runId: OLD_RUN, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE" })]);
    vi.restoreAllMocks();
    const carryOn = stored({ askContract: { ...stored().askContract, carry_on_to_report: true } });
    const today = arrangeWaker({ policy: debateShapePolicyStartValues(), set: null, stored: carryOn });
    await expect(today.application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(today.order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "recordMemoryQuestion"]);
    expect(isShapeReceiptV2(today.started[0]!.envelopeBasis)).toBe(false);
    expect(today.started[0]!.askContract).not.toHaveProperty("carry_on_to_report");
    expect(today.recordedLines).toEqual([]);
  });

  it("a planned set the copy cannot find: the new run is recorded FAILED (READMISSION), no memory question, no dispatch", async () => {
    const { application, order, recorded, dispatched, lines } = arrangeWaker({ copy: "NONE" });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "copyStartPathsForReadmission"]);
    expect(recorded).toEqual([expect.objectContaining({ runId: NEW_RUN, reason: "RUN_SETUP_FAILED:READMISSION" })]);
    expect(dispatched).toEqual([]);
    expect(lines()).toContainEqual(expect.objectContaining({ event: "api.wait.readmission_failed", runId: OLD_RUN, newRunId: NEW_RUN }));
  });

  it("a set the plan did not read (the run was to build its own list) but the copy found: the new run FAILED (READMISSION) too", async () => {
    const { application, order, recorded, dispatched, started } = arrangeWaker({ set: null, copy: "COPIED" });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(started[0]!.envelopeBasis).toMatchObject({ shape: { paths: 3, paths_source: "RUN_BUILT" } });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "copyStartPathsForReadmission"]);
    expect(recorded).toEqual([expect.objectContaining({ runId: NEW_RUN, reason: "RUN_SETUP_FAILED:READMISSION" })]);
    expect(dispatched).toEqual([]);
  });

  // Review of Task 39: the start step runs only for a signed-in person (submit's `principal.kind === "server"`); a waiting
  // run asked signed out (no content key, no owner) is re-admitted as today's debate on a version that runs the step.
  it("a signed-out person's waiting run (no content key) is re-admitted as today's debate: no start, no copy, no lines", async () => {
    const legacy: WaitingRun = Object.freeze({ ...waiting, ownerRef: null, legacyAskerId: "legacy:readmission" });
    const { application, order, started, recordedLines } = arrangeWaker({ run: legacy, set: null,
      stored: stored({ contentEncrypted: false, askerId: "legacy:readmission" }) });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(order).toEqual([`readStartPaths:${OLD_RUN}`, "startReadmittedRun", "recordMemoryQuestion"]);
    expect(started[0]!.principal).toEqual({ kind: "legacy", legacyAskerId: "legacy:readmission" });
    expect(isShapeReceiptV2(started[0]!.envelopeBasis)).toBe(false);
    expect(recordedLines).toEqual([]);
  });

  it("no store composed: no set is read, and a run that builds its own list keeps only its lines", async () => {
    const { application, order, started } = arrangeWaker({ store: false });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(order).toEqual(["startReadmittedRun", "recordPurposeLines", "recordMemoryQuestion"]);
    expect(started[0]!.envelopeBasis).toMatchObject({ shape: { paths: 3, paths_source: "RUN_BUILT" } });
  });
});
