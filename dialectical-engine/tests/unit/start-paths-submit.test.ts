/**
 * V4 start step, Task 35 (spec 2026-11-03 §4.2): submit seals the chosen paths and the purpose lines before a v2 debate's
 * first job. On both submit paths (today's and the room's, START and WAIT alike), after the rotation pin and before the
 * memory question, a debate admitted with shape receipt v2 records its set of chosen paths (a setup step, START_PATHS: a
 * failure records the run FAILED and queues nothing), then its purpose lines (logged, never failing the run, as today).
 * A run that builds its own list (RUN_BUILT: an old page's ask) has no set yet, only its lines. A dig never carries on to
 * the report, whatever a client sends, and a dig with no lines of its own records its first debate's. The hand-over from
 * the route is bound to the plan and the settings version the paths were signed for: another plan is STALE, before
 * anything is written. Task 35b (owner answer Q8, 4 Nov): another settings version is not stale; the debate argues the
 * paths as chosen, unless the active version allows fewer than were chosen (START_PATHS_NARROWED, before anything is
 * written). A hand-over's language lock is used, and the language decider is not asked. Without the start step (the
 * switch absent, or one maker on the panel) the order and the receipt are today's. Harness after role-rotation-submit.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const pinning = vi.hoisted(() => ({ order: [] as string[] }));
const parent = vi.hoisted(() => ({ reads: [] as unknown[], lines: null as unknown }));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleRotation: async () => { pinning.order.push("insertRunRoleRotation"); }
}));

vi.mock("../../apps/api/src/purpose-lines.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/api/src/purpose-lines.js")>()),
  // The first debate's lines, opened under its key: only what a dig of it reads.
  readPurposeLinesOf: async (_pool: unknown, ownerRef: string, runId: string) => {
    parent.reads.push({ ownerRef, runId });
    return parent.lines;
  }
}));

import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { START_PATHS_NARROWED, type AskRequest, type PathId, type PurposeLines, type Session, type StartMenu } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember, type StartPathsStore, type StoredStartPathSet } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveDebateShapeV2, type DebateShapePolicy
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskRoomPort, RoomDecision } from "../../apps/api/src/ask-room.js";
import type { PurposeLinesPort } from "../../apps/api/src/purpose-lines.js";
import type { QuestionLanguageLock, QuestionLanguagePort } from "../../apps/api/src/question-language/decider.js";
import {
  startAskContractMember, startOfAsk, startPathsFit, storedSetOf, type AskStartHandOver, type VerifiedStartPaths
} from "../../apps/api/src/start-paths-at-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const PARENT_RUN_ID = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-11-04T10:00:00.000Z");
const MIDNIGHT = new Date("2026-11-05T00:00:00.000Z");
const TX = Object.freeze({ marker: "the room decision's own transaction" }) as unknown as PoolClient;
const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const WAIT: RoomDecision = Object.freeze({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-11-04T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ONE_MAKER = Object.freeze(PANEL.map((seat) => Object.freeze({ ...seat, maker: "OpenAI" })));
/** The switch absent: today's row (R22). */
const POLICY = debateShapePolicyStartValues();
/** The switch on (Task 11). */
const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };

const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333", asker_id: `owner:${OWNER_REF}`, caller_scope: "ASKER",
  ownership_provenance: "server_session", provisional_identity_model: false
};
const principal = Object.freeze({ kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF });

/** Made-up question, paths and lines; no real figure anywhere. */
const Q = "Should our town build a small nuclear plant?";
const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:start", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start paths submit",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
const LINES: PurposeLines = Object.freeze({ place: "A small town by a river", time: "Within ten years" });
const PARENT_LINES: PurposeLines = Object.freeze({ place: "A coastal village", matters: "The cost to households" });
const OWN = "I worry about earthquakes near the site.";
const PICK = Object.freeze({ kind: "OWN_VIEW", suggestion_id: null, place: "w", text: "What would the waste cost to keep?" });
const digParent = Object.freeze({ parent_run_id: PARENT_RUN_ID, places: [], mode: "quick", picks: [PICK, PICK] }) as unknown as AskRequest["parent"];

const MENU = Object.freeze({ menu: Object.freeze({ menu_id: "madeUpNuclearMenu00001" }) as unknown as StartMenu, lateLists: Object.freeze([]) });
const VERIFIED_MENU: VerifiedStartPaths = Object.freeze({
  source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, questionSwap: null, menu: MENU, ownWords: Object.freeze([OWN]),
  questionEdited: false,
  paths: Object.freeze([
    Object.freeze({ pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "Whole-system costs", question: "What does it cost with the grid counted?",
      viewpoints: Object.freeze([{ viewpointId: "pt11", pickNo: null, title: "Whole-system costs", question: "What does it cost with the grid counted?", own: false }]),
      ownWords: Object.freeze([]) }),
    Object.freeze({ pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: "Safety record", question: "How safe are small reactors so far?",
      viewpoints: Object.freeze([{ viewpointId: "pt21", pickNo: null, title: "Safety record", question: "How safe are small reactors so far?", own: false }]),
      ownWords: Object.freeze([]) }),
    Object.freeze({ pathId: "b3", pathNo: 3, author: "PERSON_OWN_VIEW", title: "Earthquakes", question: OWN,
      viewpoints: Object.freeze([{ viewpointId: null, pickNo: null, title: null, question: OWN, own: true }]),
      ownWords: Object.freeze(["Earthquakes", OWN, OWN]) })
  ])
} as const);
const VERIFIED_DIG: VerifiedStartPaths = Object.freeze({
  source: "DIG_PICKS", width: 2, chosenBy: "PERSON", carryOnToReport: false, questionSwap: null, menu: null, ownWords: Object.freeze([]),
  questionEdited: false,
  paths: Object.freeze([1, 2].map((no) => Object.freeze({ pathId: `b${no}` as PathId, pathNo: no, author: "PERSON_OWN_VIEW" as const,
    title: PICK.text, question: PICK.text, ownWords: Object.freeze([PICK.text]),
    viewpoints: Object.freeze([{ viewpointId: null, pickNo: no, title: null, question: PICK.text, own: true }]) })))
});
const handOver = (verified: VerifiedStartPaths | null, extra: Partial<AskStartHandOver> = {}): AskStartHandOver =>
  Object.freeze({ binding: Object.freeze({ planKey: "free" as const, settingsVersion: 1 }), verified, lock: null, ...extra });
/** The menu's set grown to `count` paths, chosen at How wide `width` under another settings version (made-up paths). */
const widerMenu = (count: number, width: number): VerifiedStartPaths => Object.freeze({ ...VERIFIED_MENU, width,
  paths: Object.freeze(Array.from({ length: count }, (_, index) => VERIFIED_MENU.paths[index]
    ?? Object.freeze({ ...VERIFIED_MENU.paths[0]!, pathId: `b${index + 1}` as PathId, pathNo: index + 1 }))) });

const LOCK: QuestionLanguageLock = Object.freeze({ language: { code: "ro", name: "Romanian" }, source: "ELD_SITE", siteLanguage: "ro",
  rewriteAccepted: false, originalQuestionLine: null, trace: { eld: { code: "ro", reliable: true, confident: true }, fast: null, contractHash: null },
  recordCode: "ELD_SITE", localReason: null });
const DECIDED: QuestionLanguageLock = Object.freeze({ ...LOCK, language: { code: "en", name: "English" } });

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function roomDouble(order: string[], decision: RoomDecision): AskRoomPort {
  return {
    precheck: async () => {
      order.push("precheck");
      return Object.freeze({ admission: decision, estimateMicros: 1_234, now: NOW, personUses: [],
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) });
    },
    decide: async (_question, apply) => {
      order.push("decide");
      return apply({ admission: decision, estimateMicros: 1_234, now: NOW, tx: TX });
    },
    enterWait: async () => { order.push("enterWait"); },
    openStart: async () => { order.push("openStart"); },
    expectedStart: async () => null
  };
}

function storeDouble(order: string[], sets: StoredStartPathSet[], failure: Error | null): StartPathsStore {
  return {
    recordStartPaths: async (set) => {
      order.push("recordStartPaths");
      sets.push(set);
      if (failure !== null) throw failure;
      return "RECORDED";
    },
    readStartPaths: async () => null,
    readStartPathIds: async () => null,
    copyStartPathsForReadmission: async () => "NONE",
    recordCarryOnDue: async () => "NOT_ASKED",
    claimCarryOnDue: async () => [],
    readCarryOnBegun: async () => [],
    recordCarryOnDone: async () => "NOT_BEGUN"
  };
}

type Arrange = Readonly<{
  policy?: DebateShapePolicy; panel?: readonly DiscoveredPanelMember[]; store?: boolean; storeFailure?: Error;
  lines?: "RECORDED" | "NOT_SEALED" | Error | null; rotation?: boolean; decision?: RoomDecision; decider?: boolean
}>;

function arrange(input: Arrange = {}) {
  const order = pinning.order;
  order.length = 0;
  parent.reads.length = 0;
  parent.lines = null;
  const started: Array<Parameters<RunRepository["startRun"]>[0]> = [];
  const sets: StoredStartPathSet[] = [];
  const recordedLines: unknown[] = [];
  const failures: unknown[] = [];
  const decide = vi.fn(async () => DECIDED);
  const queries = { count: 0 };
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockImplementation(async () => {
    queries.count += 1;
    return 1;
  });
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (run) => {
    order.push("startRun");
    started.push(run);
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => { order.push("recordMemoryQuestion"); });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => { order.push("enqueue"); return WORK_ITEM_ID; });
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async () => { order.push("enqueue"); return WORK_ITEM_ID; });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    order.push("recordSetupFailure");
    failures.push((record as { reason: string }).reason);
    return true;
  });
  const lines = input.lines === undefined ? "RECORDED" : input.lines;
  const purposeLines: PurposeLinesPort | null = lines === null ? null : {
    record: async (ownerRef, runId, recorded) => {
      order.push("recordPurposeLines");
      recordedLines.push({ ownerRef, runId, lines: recorded });
      if (lines instanceof Error) throw lines;
      return lines;
    }
  };
  const questionLanguage: QuestionLanguagePort = { decide };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:start-paths",
    settlementWatchHandle: "watch:start-paths",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, shapeV2, length, engine, web }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(shapeV2 == null ? {} : { shapeV2 }), ...(length === null ? {} : { length }),
        ...(engine === null ? {} : { engine }), ...(web === null ? {} : { web }) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    debateShapePolicy: input.policy ?? POLICY_ON,
    lengthGuidancePolicy: lengthGuidancePolicyStartValues(),
    engineVersionPolicy: engineVersionPolicyStartValues(),
    ...(input.decider === true ? { questionLanguage } : {}),
    ...(input.rotation === true ? { roleRotation: { readCounts: async () => ({}) } } : {}),
    ...(input.store === false ? {} : { startPaths: storeDouble(order, sets, input.storeFailure ?? null) }),
    ...(purposeLines === null ? {} : { purposeLines }),
    ...(input.decision === undefined ? {} : { room: roomDouble(order, input.decision) })
  };
  const application = new PostgresAskApplication(stubPool(), { dispatch: vi.fn(async () => { order.push("dispatch"); }) }, settings,
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  const submit = (asked: AskRequest = ask(), startHandOver?: AskStartHandOver) =>
    startHandOver === undefined ? application.submit(asked, session, principal) : application.submit(asked, session, principal, startHandOver);
  return { order, queries, started, sets, recordedLines, failures, decide, submit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startOfAsk: the hand-over, the binding and the carry-on box", () => {
  const PAID = Object.freeze({ options: Object.freeze([3, 5, 7]), default: 5 });
  const FREE = Object.freeze({ options: Object.freeze([3]), default: 3 });
  const of = (input: Partial<Parameters<typeof startOfAsk>[0]> = {}) =>
    startOfAsk({ widths: FREE, plan: "free", registerVersion: 1, ask: ask(), handOver: handOver(VERIFIED_MENU), ...input });

  it("verified paths keep their count and source; an old page's ask builds its own list at the default width", () => {
    expect(of()).toEqual({ shape: { paths: 3, pathsSource: "MENU" }, verified: VERIFIED_MENU, purposeLines: null, carryOnToReport: false,
      parentRunId: null });
    expect(of({ widths: PAID, plan: "plus", handOver: null, ask: ask({ purpose_lines: LINES }) })).toEqual({
      shape: { paths: 5, pathsSource: "RUN_BUILT" }, verified: null, purposeLines: LINES, carryOnToReport: false, parentRunId: null });
  });

  it("no widths: no start without paths, STALE with them", () => {
    expect(of({ widths: null, handOver: null })).toBeNull();
    expect(of({ widths: null, handOver: handOver(null, { lock: LOCK }) })).toBeNull();
    expect(() => of({ widths: null })).toThrow(expect.objectContaining({ code: "START_PATHS_STALE" }));
  });

  it("another plan is STALE", () => {
    expect(() => of({ plan: "plus", widths: PAID })).toThrow(expect.objectContaining({ code: "START_PATHS_STALE" }));
  });

  // Task 35b (owner answer Q8, 4 Nov): a site update since Next is not stale; the debate argues the paths as chosen.
  it("another settings version is accepted where the version runs the step and the paths fit", () => {
    expect(of({ registerVersion: 2 })).toEqual({ shape: { paths: 3, pathsSource: "MENU" }, verified: VERIFIED_MENU, purposeLines: null,
      carryOnToReport: false, parentRunId: null });
    expect(of({ handOver: handOver(null, { binding: { planKey: "free", settingsVersion: 2 } }) })).toEqual({
      shape: { paths: 3, pathsSource: "RUN_BUILT" }, verified: null, purposeLines: null, carryOnToReport: false, parentRunId: null });
    // A newer binding (a way back after an upload) is the same; the set keeps the width the person chose, even one the
    // active version no longer offers.
    expect(of({ handOver: handOver(VERIFIED_MENU, { binding: { planKey: "free", settingsVersion: 2 } }) }))
      .toMatchObject({ shape: { paths: 3, pathsSource: "MENU" }, verified: VERIFIED_MENU });
    const five = widerMenu(5, 5);
    expect(of({ widths: { options: [3, 7], default: 7 }, plan: "premium", registerVersion: 2,
      handOver: handOver(five, { binding: { planKey: "premium", settingsVersion: 1 } }) }))
      .toMatchObject({ shape: { paths: 5, pathsSource: "MENU" }, verified: { width: 5, paths: five.paths } });
  });

  // Review of Task 35b: the paths chosen decide, not the How wide they were chosen at. Four paths chosen at How wide 7
  // (the AIs found fewer, choose-f22) fit a version whose widest is 5: the debate starts, its width kept.
  it("another settings version: the count of the chosen paths decides, not the How wide they were chosen at", () => {
    const fourAtSeven = widerMenu(4, 7);
    expect(of({ widths: { options: [3, 5], default: 5 }, plan: "premium", registerVersion: 2,
      handOver: handOver(fourAtSeven, { binding: { planKey: "premium", settingsVersion: 1 } }) }))
      .toMatchObject({ shape: { paths: 4, pathsSource: "MENU" }, verified: { width: 7, paths: fourAtSeven.paths } });
  });

  it("another settings version whose widest is below the paths → START_PATHS_NARROWED", () => {
    expect(START_PATHS_NARROWED).toBe("START_PATHS_NARROWED");
    const narrowed = (): unknown => of({ widths: { options: [3], default: 3 }, plan: "premium", registerVersion: 2,
      handOver: handOver(widerMenu(5, 5), { binding: { planKey: "premium", settingsVersion: 1 } }) });
    expect(narrowed).toThrow(expect.objectContaining({ name: "TypedDomainError", code: "START_PATHS_NARROWED",
      message: "START_PATHS_NARROWED" }));
  });

  it("Free with four paths after a version move → START_PATHS_NARROWED", () => {
    expect(() => of({ registerVersion: 2, handOver: handOver(widerMenu(4, 5)) }))
      .toThrow(expect.objectContaining({ code: "START_PATHS_NARROWED" }));
    // Free's cap of 3 holds whatever the widths say.
    expect(() => of({ widths: PAID, registerVersion: 2, handOver: handOver(widerMenu(4, 5)) }))
      .toThrow(expect.objectContaining({ code: "START_PATHS_NARROWED" }));
  });

  it("another version, widths null, paths → STALE (unchanged); no paths → no start", () => {
    expect(() => of({ widths: null, registerVersion: 2 })).toThrow(expect.objectContaining({ code: "START_PATHS_STALE" }));
    expect(of({ widths: null, handOver: handOver(null, { binding: { planKey: "free", settingsVersion: 2 } }) })).toBeNull();
  });

  it.each([
    [[3, 5, 7], "premium", 7, true],
    [[3, 5], "premium", 7, false],
    [[3, 5, 7], "free", 4, false],
    [[3], "free", 3, true]
  ] as const)("startPathsFit(%o, %s, %i) is %s", (options, plan, paths, fits) => {
    expect(startPathsFit({ options, default: options[0] }, plan, paths)).toBe(fits);
  });

  it("carries on only a new question that asked; a dig never does, whatever a client sends", () => {
    expect(of({ ask: ask({ carry_on_to_report: true }) })).toMatchObject({ carryOnToReport: true, verified: { carryOnToReport: true } });
    const dig = of({ ask: ask({ carry_on_to_report: true, parent: digParent }),
      handOver: handOver({ ...VERIFIED_DIG, carryOnToReport: true }) });
    expect(dig).toMatchObject({ carryOnToReport: false, verified: { carryOnToReport: false }, parentRunId: PARENT_RUN_ID });
    const publicDig = of({ handOver: null, ask: ask({ carry_on_to_report: true,
      public_parent: { public_ref: "88888888-8888-4888-8888-888888888888", places: [], mode: "quick" } as unknown as AskRequest["public_parent"] }) });
    expect(publicDig).toMatchObject({ carryOnToReport: false, parentRunId: null });
  });

  it("the ask-contract member: carry_on_to_report only on receipt v2, only when asked", () => {
    const shapeV2 = resolveDebateShapeV2(POLICY_ON, "free",
      { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths: 3, pathsSource: "MENU" }, 2);
    const v2 = computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2, depth: 1, backupSequencesProvisioned: 0, shapeV2 });
    const v1 = computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2, depth: 1, backupSequencesProvisioned: 0 });
    const asked = of({ ask: ask({ carry_on_to_report: true }) });
    expect(startAskContractMember(asked, v2)).toEqual({ carry_on_to_report: true });
    expect(startAskContractMember(asked, v1)).toEqual({});
    expect(startAskContractMember(of(), v2)).toEqual({});
    expect(startAskContractMember(null, v2)).toEqual({});
  });
});

describe("the START_PATHS setup step on today's path", () => {
  it("MENU: the set is sealed after the run exists and before the memory question, exactly as storedSetOf maps it", async () => {
    const { order, started, sets, recordedLines, submit } = arrange();
    await expect(submit(ask(), handOver(VERIFIED_MENU))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual(["startRun", "recordStartPaths", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(sets).toEqual([storedSetOf(RUN_ID, VERIFIED_MENU)]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2",
      shape: { plan: "free", paths: 3, paths_source: "MENU", run_list_writers: 0 } });
    expect(recordedLines).toEqual([]);
    expect("carry_on_to_report" in (started[0]!.askContract ?? {})).toBe(false);
  });

  it("RUN_BUILT with purpose lines: no set yet, the lines recorded at that step; the receipt is the run's own list of 3", async () => {
    const { order, started, sets, recordedLines, submit } = arrange();
    await expect(submit(ask({ purpose_lines: LINES }))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual(["startRun", "recordPurposeLines", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(sets).toEqual([]);
    expect(recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: RUN_ID, lines: LINES }]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2",
      shape: { paths: 3, paths_source: "RUN_BUILT", run_list_writers: 3 } });
  });

  it("after the rotation pin: the set, then the lines, then the memory question", async () => {
    const { order, submit } = arrange({ rotation: true });
    await submit(ask({ purpose_lines: LINES }), handOver(VERIFIED_MENU));
    expect(order).toEqual(["startRun", "insertRunRoleRotation", "recordStartPaths", "recordPurposeLines",
      "recordMemoryQuestion", "enqueue", "dispatch"]);
  });

  it("a seal that fails records RUN_SETUP_FAILED:START_PATHS and queues nothing", async () => {
    const failure = new Error("seal refused");
    const { order, failures, submit } = arrange({ storeFailure: failure });
    await expect(submit(ask({ purpose_lines: LINES }), handOver(VERIFIED_MENU))).rejects.toBe(failure);
    expect(order).toEqual(["startRun", "recordStartPaths", "recordSetupFailure"]);
    expect(failures).toEqual(["RUN_SETUP_FAILED:START_PATHS"]);
  });

  it("no store composed: START_PATHS_STORE_UNAVAILABLE, the run FAILED at START_PATHS", async () => {
    const { order, failures, submit } = arrange({ store: false });
    await expect(submit(ask(), handOver(VERIFIED_MENU))).rejects.toMatchObject({ code: "START_PATHS_STORE_UNAVAILABLE" });
    expect(order).toEqual(["startRun", "recordSetupFailure"]);
    expect(failures).toEqual(["RUN_SETUP_FAILED:START_PATHS"]);
  });

  it.each([["NOT_SEALED" as const, "PURPOSE_LINES_NOT_SEALED"], [new Error("lines down"), "PURPOSE_LINES_FAILED"]])(
    "a purpose-lines record answering %s leaves the run going, with one content-free line", async (answer, code) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { order, submit } = arrange({ lines: answer });
      await expect(submit(ask({ purpose_lines: LINES }), handOver(VERIFIED_MENU))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
      expect(order).toEqual(["startRun", "recordStartPaths", "recordPurposeLines", "recordMemoryQuestion", "enqueue", "dispatch"]);
      const lines = logged.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("PURPOSE_LINES"));
      expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_PURPOSE_LINES", code })]);
    });
});

describe("the START_PATHS setup step with a room (B6b): START and WAIT alike", () => {
  it("START: the set before the memory question, the hold and the first job", async () => {
    const { order, sets, started, submit } = arrange({ decision: START });
    await expect(submit(ask(), handOver(VERIFIED_MENU))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual(["precheck", "decide", "startRun", "recordStartPaths", "recordMemoryQuestion", "openStart",
      "enqueue", "dispatch"]);
    expect(sets).toEqual([storedSetOf(RUN_ID, VERIFIED_MENU)]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2", shape: { paths_source: "MENU" } });
  });

  it("WAIT: the set and the lines before the place in line", async () => {
    const { order, recordedLines, submit } = arrange({ decision: WAIT });
    await expect(submit(ask({ purpose_lines: LINES }), handOver(VERIFIED_MENU))).resolves.toMatchObject({ status: "WAITING" });
    expect(order).toEqual(["precheck", "decide", "startRun", "recordStartPaths", "recordPurposeLines",
      "recordMemoryQuestion", "enterWait"]);
    expect(recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: RUN_ID, lines: LINES }]);
  });

  it("a seal that fails inside the decision records RUN_SETUP_FAILED:START_PATHS and holds nothing", async () => {
    const failure = new Error("seal refused");
    const { order, failures, submit } = arrange({ decision: START, storeFailure: failure });
    await expect(submit(ask(), handOver(VERIFIED_MENU))).rejects.toBe(failure);
    expect(order).toEqual(["precheck", "decide", "startRun", "recordStartPaths", "recordSetupFailure"]);
    expect(failures).toEqual(["RUN_SETUP_FAILED:START_PATHS"]);
  });
});

describe("without the start step: today's order and receipt", () => {
  it.each([undefined, START])("the switch absent (room %o): no set, no lines at submit, receipt v1", async (decision) => {
    const { order, started, recordedLines, submit } = arrange({ policy: POLICY, ...(decision === undefined ? {} : { decision }) });
    await submit(ask({ purpose_lines: LINES, carry_on_to_report: true }));
    expect(order).not.toContain("recordStartPaths");
    expect(order).not.toContain("recordPurposeLines");
    expect(recordedLines).toEqual([]);
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v1" });
    expect("carry_on_to_report" in (started[0]!.askContract ?? {})).toBe(false);
  });

  it("one maker on the panel: the paths are not sealed and the receipt is today's", async () => {
    const { order, started, submit } = arrange({ panel: ONE_MAKER });
    await submit(ask({ purpose_lines: LINES, carry_on_to_report: true }), handOver(VERIFIED_MENU));
    expect(order).toEqual(["startRun", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(started[0]!.envelopeBasis.formula_version).toBe("DR-184-v4");
    expect("carry_on_to_report" in (started[0]!.askContract ?? {})).toBe(false);
  });
});

describe("the hand-over's binding and lock", () => {
  it("a hand-over's lock is the run's, and the language decider is not asked", async () => {
    const { decide, started, submit } = arrange({ decider: true });
    await submit(ask(), handOver(VERIFIED_MENU, { lock: LOCK }));
    expect(decide).not.toHaveBeenCalled();
    expect(started[0]!.argumentLanguageTag).toBe("ro");
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE" } });
  });

  it("without a lock in the hand-over the decider is asked, as today", async () => {
    const { decide, started, submit } = arrange({ decider: true });
    await submit(ask(), handOver(VERIFIED_MENU));
    expect(decide).toHaveBeenCalledTimes(1);
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "en" } });
  });

  it.each([
    ["another plan", handOver(VERIFIED_MENU, { binding: { planKey: "plus", settingsVersion: 1 } }), POLICY_ON],
    ["paths on a version without the switch", handOver(VERIFIED_MENU), POLICY]
  ] as const)("%s: START_PATHS_STALE, with nothing written", async (_name, stale, policy) => {
    const { order, queries, started, decide, submit } = arrange({ policy, decider: true });
    await expect(submit(ask(), stale)).rejects.toMatchObject({ name: "AskRefusal", code: "START_PATHS_STALE" });
    expect(order).toEqual([]);
    expect(queries.count).toBe(0);
    expect(started).toEqual([]);
    if (stale.lock !== null) expect(decide).not.toHaveBeenCalled();
  });

  // Task 35b (owner answer Q8, 4 Nov): the row "another settings version" was STALE; a site update is no longer stale.
  it("another settings version: QUEUED, the set sealed as storedSetOf maps it, the hand-over's lock used and the decider not asked", async () => {
    const { order, sets, started, decide, submit } = arrange({ decider: true });
    await expect(submit(ask(), handOver(VERIFIED_MENU, { binding: { planKey: "free", settingsVersion: 2 }, lock: LOCK })))
      .resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual(["startRun", "recordStartPaths", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(sets).toEqual([storedSetOf(RUN_ID, VERIFIED_MENU)]);
    expect(decide).not.toHaveBeenCalled();
    expect(started[0]!.argumentLanguageTag).toBe("ro");
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE" } });
    expect(started[0]!.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v2", shape: { paths: 3, paths_source: "MENU" } });
  });

  it("another settings version with more paths than its widest: START_PATHS_NARROWED, with nothing written", async () => {
    const { order, queries, started, decide, submit } = arrange({ decider: true });
    await expect(submit(ask(), handOver(widerMenu(4, 5), { binding: { planKey: "free", settingsVersion: 2 }, lock: LOCK })))
      .rejects.toMatchObject({ name: "AskRefusal", code: "START_PATHS_NARROWED" });
    expect(order).toEqual([]);
    expect(queries.count).toBe(0);
    expect(started).toEqual([]);
    expect(decide).not.toHaveBeenCalled();
  });
});

describe("carry on to the report", () => {
  it("only when asked: the set's flag and the ask contract's member; a run that builds its own list keeps the member", async () => {
    const asked = arrange();
    await asked.submit(ask({ carry_on_to_report: true }), handOver(VERIFIED_MENU));
    expect(asked.sets[0]!.carryOnToReport).toBe(true);
    expect(asked.started[0]!.askContract).toMatchObject({ carry_on_to_report: true });
    const built = arrange();
    await built.submit(ask({ carry_on_to_report: true }));
    expect(built.sets).toEqual([]);
    expect(built.started[0]!.askContract).toMatchObject({ carry_on_to_report: true });
    const notAsked = arrange();
    await notAsked.submit(ask(), handOver(VERIFIED_MENU));
    expect(notAsked.sets[0]!.carryOnToReport).toBe(false);
    expect("carry_on_to_report" in (notAsked.started[0]!.askContract ?? {})).toBe(false);
  });

  it("a dig's ask carrying carry_on_to_report never carries on: its set's flag is false and no member is written", async () => {
    const { sets, started, submit } = arrange();
    await submit(ask({ parent: digParent, carry_on_to_report: true }), handOver({ ...VERIFIED_DIG, carryOnToReport: true }));
    expect(sets).toEqual([storedSetOf(RUN_ID, VERIFIED_DIG)]);
    expect(sets[0]!.carryOnToReport).toBe(false);
    expect("carry_on_to_report" in (started[0]!.askContract ?? {})).toBe(false);
  });
});

describe("a dig's purpose lines", () => {
  it("a dig with no lines of its own records its first debate's, so place and time reach it", async () => {
    const { order, recordedLines, submit } = arrange();
    parent.lines = PARENT_LINES;
    await submit(ask({ parent: digParent }), handOver(VERIFIED_DIG));
    expect(parent.reads).toEqual([{ ownerRef: OWNER_REF, runId: PARENT_RUN_ID }]);
    expect(recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: RUN_ID, lines: PARENT_LINES }]);
    expect(order).toEqual(["startRun", "recordStartPaths", "recordPurposeLines", "recordMemoryQuestion", "enqueue", "dispatch"]);
  });

  it("a dig with its own lines records those and reads nothing; a first debate with none leaves the dig without", async () => {
    const own = arrange();
    parent.lines = PARENT_LINES;
    await own.submit(ask({ parent: digParent, purpose_lines: LINES }), handOver(VERIFIED_DIG));
    expect(parent.reads).toEqual([]);
    expect(own.recordedLines).toEqual([{ ownerRef: OWNER_REF, runId: RUN_ID, lines: LINES }]);
    const none = arrange();
    await expect(none.submit(ask({ parent: digParent }), handOver(VERIFIED_DIG))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(parent.reads).toEqual([{ ownerRef: OWNER_REF, runId: PARENT_RUN_ID }]);
    expect(none.recordedLines).toEqual([]);
    expect(none.order).not.toContain("recordPurposeLines");
  });
});
