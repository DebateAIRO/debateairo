// V4 start step, Task 91b (spec 2026-11-03 §5; plan Task 91b Step 1): the practice debate with the start step, its digs and the
// month report. The two debate-only flags (`--start-step free:3|premium:5`, `--digs 0..2`) and their refusals; a dry run on fake
// gates through runPracticeDebate, whose month lines (PRE_START, DEBATE, END_OF_DEBATE, DIG) add up to the ledger rows and whose
// figures go only to the --out folder; the composition hands the step before Start its key as main.ts does (drift guard); and a
// made-up --shape-policy file holding `startStep` (as Step 4 writes one) is read with `startStep` kept. The throwaway database,
// the register import and the two compositions are stand-ins here (nothing is started, nothing is sent); every figure is made up.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMoreOf, type Answer, type StartMenu } from "@debateai/contract";
import { PREVIEW_PROVIDER_REF_MODELS, parsePreviewEnvironmentConfig } from "@debateai/providers";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepOf, debateShapeStartStepStartValues,
  engineVersionPolicyStartValues, parseDebateShapePolicy, resolveDebateShapeV2, type DebateShapePolicy
} from "@debateai/register";
import { newStartStepKey, signStartCheck, signStartList, signStartMenu } from "../../apps/api/src/start-step/signing.js";
import type { StartStepPort } from "../../apps/api/src/start-step/step.js";
import { runPractice } from "../../tools/preview-practice/practice.js";
import { runPracticeDebate } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { debateReport } from "../../tools/preview-practice/practice-report.js";
import { practiceShapeOverrideFromArgs } from "../../tools/preview-practice/practice-shape.js";
import { parsePracticeRegisterExport, type PracticeRegisterImportReceipt } from "../../tools/preview-practice/practice-register-import.js";
import { composePracticeRunner } from "../../tools/preview-practice/practice-runner-composition.js";
import type { PracticeSettings, PracticeSockets } from "../../tools/preview-practice/practice-settings.js";
import {
  PRACTICE_START_FLAGS, PRACTICE_START_MONTH_FILE, practicePathFillSpread, practiceStartPhaseOf, practiceStartShapePolicyOf, practiceStartStepFromArgs
} from "../../tools/preview-practice/practice-start-step.js";
import { practiceStartMonthLines, type PracticeStartMonthLine } from "../../tools/preview-practice/practice-verdict.js";
import { practiceCallCostNanoUsd } from "../../tools/preview-practice/practice-web.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";
import { objectAfter, withoutComments } from "../support/source-text.js";

type LedgerRow = Readonly<{ runId: string; callSiteKey: string; actorRef: string; finishedAt: Date; metadata: unknown }>;

const seen = vi.hoisted(() => ({
  versions: new Set<string>(),
  rows: new Map<number, unknown>(),
  receipt: null as unknown,
  /** The asks handed to the stand-in application, with their hand-overs (the fourth argument). */
  submits: [] as { request: Record<string, unknown>; handOver: unknown }[],
  /** Made-up charges of the calls before Start (micro-dollars), one per call, as 0158's writer records them. */
  preStart: [] as string[],
  /** Made-up ledger rows of every run (the stand-in runner writes them when it runs a work item). */
  ledger: [] as LedgerRow[],
  /** Each work item the stand-in application dispatched: its run. */
  workItems: new Map<string, string>(),
  /** The step before Start the stand-in composition hands over (set per test). */
  composed: null as unknown,
  /** What the stand-in runner writes for a run, by the order it ran in (0: the debate, 1: the first dig). */
  writes: [] as ((runId: string) => readonly LedgerRow[])[],
  ran: 0,
  digJoins: [] as unknown[],
  digPicks: [] as unknown[],
  /** Task 91e: the debate's admitted panel (core.run.discovered_panel), its receipt, its stored set (codes), its answer and story. */
  panel: [] as unknown[],
  basis: null as unknown,
  pathSet: [] as { source: string; author: string }[],
  projection: null as unknown,
  story: null as unknown
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/db")>(),
  migrate: vi.fn(async () => undefined),
  configureContentEncryption: vi.fn(),
  // The dig's three steps at Start (as POST /v1/asks takes them), on stand-ins.
  PostgresDigModelRepository: class { async readDigLevel() { return 0; } },
  PostgresInvestigationRepository: class {
    async join(input: unknown) { seen.digJoins.push(input); return { outcome: "JOINED", investigationId: "i".repeat(8), digLevel: 1 }; }
    async reopen() { return "ALREADY_OPEN"; }
  },
  PostgresDigPicksRepository: class { async record(input: unknown) { seen.digPicks.push(input); return "RECORDED"; } }
}));
vi.mock("@debateai/register", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/register")>(),
  readDebateShapePolicy: vi.fn(async (_pool: unknown, version: number) => seen.rows.get(version) ?? null),
  readLengthGuidancePolicy: vi.fn(async () => null),
  readPreviewLineUpPolicy: vi.fn(async () => null),
  readEngineVersionPolicy: vi.fn(async () => null)
}));
vi.mock("@debateai/serve", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/serve")>(),
  ServeRepository: class { async readAnswerProjection() { return seen.projection; } }
}));
vi.mock("@debateai/story", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/story")>(),
  StoryRepository: class { async readForAnswer() { return seen.story; } }
}));
// Task 91e: the map's readers (a content lease over a real pool) on the stand-in database: a path debate stores no map.
vi.mock("@debateai/map", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/map")>(),
  readMapChoiceForRun: vi.fn(async () => null),
  readMapItemsForRun: vi.fn(async () => [])
}));
vi.mock("../../tools/preview-practice/practice-throwaway-db.js", () => ({
  startPracticeDatabase: vi.fn(async () => {
    const pool = {
      query: async (text: string, params?: unknown[]) => {
        if (text.includes("FROM register.register_version")) return { rows: seen.versions.has(String(params?.[0])) ? [{ "?column?": 1 }] : [] };
        if (text.includes("FROM ledger.model_spend") && text.includes("PRE_START")) {
          return { rows: seen.preStart.map((micros) => ({ charge_micros: micros })) };
        }
        if (text.includes("starts_with(entry.call_site_key")) {
          const [runId, prefix] = params as [string, string];
          return { rows: seen.ledger.filter((row) => row.runId === runId && row.callSiteKey.startsWith(prefix)).map((row, index) => ({
            attempt_id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`, call_site_key: row.callSiteKey, actor_ref: row.actorRef,
            outcome: "OK", started_at: new Date(row.finishedAt.getTime() - 1_000), finished_at: row.finishedAt, raw_artifact_ref: null,
            metadata_json: row.metadata, raw_text: null, content_ciphertext: null })) };
        }
        // Task 91e: the debate's panel, its receipt and its stored set, as the practice reads them after the debate.
        if (text.includes("SELECT discovered_panel FROM core.run")) return { rows: [{ discovered_panel: seen.panel }] };
        if (text.includes("SELECT depth_params, envelope_basis FROM core.run")) {
          return { rows: seen.basis === null ? [] : [{ depth_params: { depth: 1 }, envelope_basis: seen.basis }] };
        }
        if (text.includes("core.start_path_set")) return { rows: seen.pathSet };
        return { rows: [] };
      }
    };
    return { pool, databaseName: "debateai_practice_00000000", extraPool: () => pool, stop: async () => undefined };
  })
}));
vi.mock("../../tools/preview-practice/practice-register-import.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../tools/preview-practice/practice-register-import.js")>(),
  importPracticeRegister: vi.fn(async () => seen.receipt),
  publishPracticeOverrideVersion: vi.fn(async (...args: unknown[]) => {
    seen.rows.set(6, (args[3] as { shape: unknown }).shape);
    return { baseRegisterVersion: "5", registerVersion: "6", shapeRow: "ADDED", lengthRow: null, snapshotSha256: "a".repeat(64) };
  })
}));
vi.mock("../../tools/preview-practice/practice-ask-composition.js", () => ({
  practiceRemainingPorts: () => ({ deepinfra: async () => { throw new Error("no gate"); }, anthropic: async () => { throw new Error("no gate"); } }),
  composePracticeAsk: vi.fn(async (input: { dispatcher: { dispatch(job: { runId: string; workItemId: string }): Promise<void> } }) => {
    const composed = seen.composed as { startStep: StartStepPort; startStepKey: unknown; startView: unknown; answers: Map<string, Answer> };
    return {
      application: {
        submit: async (request: Record<string, unknown>, _session: unknown, _principal: unknown, handOver?: unknown) => {
          seen.submits.push({ request, handOver: handOver ?? null });
          const runId = `${String(seen.submits.length).padStart(8, "0")}-1111-4111-8111-111111111111`;
          const workItemId = `${String(seen.submits.length).padStart(8, "0")}-2222-4222-8222-222222222222`;
          seen.workItems.set(workItemId, runId);
          await input.dispatcher.dispatch({ runId, workItemId });
          return { run_ref: runId, status: "QUEUED" };
        },
        readRunAnswer: async (runId: string) => composed.answers.get(runId) ?? null
      },
      startStep: composed.startStep, startStepKey: composed.startStepKey, startView: composed.startView, hosted: null
    };
  })
}));
vi.mock("../../tools/preview-practice/practice-runner-composition.js", () => ({
  composePracticeRunner: vi.fn(async () => ({
    runner: { executeWorkItem: async (workItemId: string) => {
      const runId = seen.workItems.get(workItemId)!;
      const write = seen.writes[seen.ran] ?? (() => []);
      seen.ran += 1;
      seen.ledger.push(...write(runId));
      return { kind: "COMPLETED", answerId: `answer-of-${runId}` };
    } },
    callStats: { summary: () => ({}) }, money: null, structureRouted: false
  }))
}));

const REGISTER = parsePracticeRegisterExport(JSON.stringify({
  schema: "preview-practice-register-export-v1",
  versions: [
    { register_version: "4", row_count: 1, base_register_version: null, publication_id: null, request_sha256: null, snapshot_sha256: null,
      publication_kind: null, recorded_at: null },
    { register_version: "5", row_count: 1, base_register_version: "4", publication_id: null, request_sha256: null, snapshot_sha256: null,
      publication_kind: "GENERAL", recorded_at: null }
  ],
  rows: [{ register_version: "4", row_key: "alpha", value_json: "1", source_ref: "live" },
    { register_version: "5", row_key: "alpha", value_json: "1", source_ref: "live" }]
}));
const GLM = "zai-org/GLM-5.3-Flash";
const HAIKU = "claude-haiku-5-5";
const GATE = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" };
const ENV = parsePreviewEnvironmentConfig(JSON.stringify({ ...GATE, free_model_ids: [GLM, HAIKU],
  premium_model_ids: [GLM, "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", HAIKU] }))!;
const SETTINGS = { runner: { REGISTER_VERSION: 5, RELEASE_KEY: ["r5", "d50e33165a1b"].join("-"), PREVIEW_GATE_SETTINGS: ENV.gate,
  PREVIEW_ENV_LINE_UP: ENV.envLineUp }, previewConfig: null } as unknown as PracticeSettings;
const SOCKETS = { deepinfra: "/nowhere/deepinfra.sock", anthropic: "/nowhere/anthropic.sock" } as PracticeSockets;
const LIVE: PracticeRegisterImportReceipt = Object.freeze({ registerVersion: "5", steps: [] });
/** The row Step 4 writes: the release's own row with the start step's start values added and premium carrying the Plus row. */
const STEP_ROW: DebateShapePolicy = (() => {
  const start = debateShapePolicyStartValues();
  return parseDebateShapePolicy({ ...start, plans: { ...start.plans, premium: start.plans.plus }, startStep: debateShapeStartStepStartValues() });
})();
const refOf = (model: string): string => Object.entries(PREVIEW_PROVIDER_REF_MODELS).find(([, id]) => id === model)![0];
/** A made-up call's stored usage (made-up token counts). */
const usage = (input: number, output: number) => ({ usage: { prompt_tokens: input, completion_tokens: output } });

/**
 * The step before Start on fake gates: every reference signed with the composition's key as the real step signs it, the
 * menu the shared fixture's, and each call charged to the person (a made-up 0158 row) as it ends.
 */
function fakeStep(key: ReturnType<typeof newStartStepKey>, menu: StartMenu): StartStepPort {
  const charge = (micros: number) => { seen.preStart.push(String(micros)); };
  const lock = { language: { code: "en", name: "English" }, source: "PRACTICE_STAND_IN", siteLanguage: "en", rewriteAccepted: false,
    originalQuestionLine: null, trace: { steps: [] }, recordCode: "PRACTICE", localReason: null };
  return {
    route: "PREVIEW",
    async lists(input, emit) {
      const binding = { ownerScope: input.ownerScope, questionLine: input.question_line, planKey: input.planKey, settingsVersion: input.settingsVersion };
      charge(3); // the planner
      emit({ event: "check", data: { check_ref: signStartCheck(key, { ...binding, lock: lock as never, originalQuestionLine: null }),
        language: { code: "en", name: "English" }, seats: 2 } });
      for (const listNo of [1, 2]) {
        charge(5);
        const list = { list_no: listNo } as never;
        emit({ event: "list", data: { list: { list, ref: signStartList(key, { ...binding, list }) } } });
      }
      emit({ event: "cut", data: { lists_in: 2 } });
      emit({ event: "end", data: { reason: "DONE" } });
    },
    async merge(input) {
      charge(7);
      return { source: "AI", menu: { menu, ref: signStartMenu(key, { ownerScope: input.ownerScope, questionLine: input.question_line,
        planKey: input.planKey, settingsVersion: input.settingsVersion, menu }) } };
    },
    async combine() {
      charge(2);
      return { source: "AI", title: "Made-up combined path", question: "Made-up combined question?", combine_ref: "made.up" };
    },
    async fit() { return { source: "NONE", reason: "OFF" }; }
  };
}

beforeEach(() => {
  seen.versions = new Set(["4", "5"]);
  seen.rows.clear();
  seen.receipt = LIVE;
  seen.composed = null;
  seen.ran = 0;
  seen.workItems.clear();
  for (const list of [seen.submits, seen.preStart, seen.ledger, seen.writes, seen.digJoins, seen.digPicks, seen.panel, seen.pathSet]) list.length = 0;
  seen.basis = null;
  seen.projection = null;
  seen.story = null;
});

describe("Task 91b: --start-step and --digs, debate mode only", () => {
  const flags = (entries: Readonly<Record<string, string>>) => new Map(Object.entries(entries));

  it("reads free:3 and premium:5, with 0, 1 or 2 digs (none given: 0)", () => {
    expect(PRACTICE_START_FLAGS).toEqual(["--start-step", "--digs"]);
    expect(practiceStartStepFromArgs("debate", flags({}))).toBeNull();
    expect(practiceStartStepFromArgs("debate", flags({ "--start-step": "free:3" }))).toEqual({ plan: "free", paths: 3, digs: 0 });
    expect(practiceStartStepFromArgs("debate", flags({ "--start-step": "free:3", "--digs": "1" }))).toEqual({ plan: "free", paths: 3, digs: 1 });
    expect(practiceStartStepFromArgs("debate", flags({ "--start-step": "premium:5", "--digs": "0" }))).toEqual({ plan: "premium", paths: 5, digs: 0 });
    expect(practiceStartStepFromArgs("debate", flags({ "--start-step": "premium:7", "--digs": "2" }))).toEqual({ plan: "premium", paths: 7, digs: 2 });
  });

  it("refuses free:4, plus:5 and --digs 3 naming the flag only (the value is never repeated)", () => {
    const refusal = (entries: Readonly<Record<string, string>>) => {
      try { practiceStartStepFromArgs("debate", flags(entries)); } catch (error) { return error as Error & { code?: string }; }
      return null;
    };
    for (const [entries, flag] of [[{ "--start-step": "free:4" }, "--start-step"], [{ "--start-step": "plus:5" }, "--start-step"],
      [{ "--start-step": "premium:8" }, "--start-step"], [{ "--start-step": "free" }, "--start-step"],
      [{ "--start-step": "free:3", "--digs": "3" }, "--digs"], [{ "--start-step": "free:3", "--digs": "one" }, "--digs"],
      [{ "--digs": "1" }, "--digs"]] as const) {
      const error = refusal(entries);
      expect(error?.code).toBe("PRACTICE_FLAG_VALUE_INVALID");
      expect(error?.message).toBe(`PRACTICE_FLAG_VALUE_INVALID: ${flag}`);
    }
  });

  it("either flag in openings (or any other) mode is refused before anything is read", async () => {
    for (const [mode, flag, value] of [["openings", "--start-step", "free:3"], ["openings", "--digs", "1"], ["formats", "--start-step", "premium:5"],
      ["language", "--digs", "2"]] as const) {
      const logged: string[] = [];
      const outcome = await runPractice([mode, flag, value], {}, { log: (line) => logged.push(line) });
      expect(outcome.report).toMatchObject({ reasons: ["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"] });
      expect(logged).toContain(`practice could not run: PRACTICE_FLAG_VALUE_INVALID: ${flag} (debate mode only)`);
      expect(logged.join("\n")).not.toContain(value);
    }
    // In debate mode a bad value is refused before the settings, the sockets or any gate is read.
    const logged: string[] = [];
    const outcome = await runPractice(["debate", "--start-step", "plus:5"], {}, { log: (line) => logged.push(line) });
    expect(outcome.report).toMatchObject({ reasons: ["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"] });
    expect(logged).toContain("practice could not run: PRACTICE_FLAG_VALUE_INVALID: --start-step");
    // A free start asks on the Free plan, where the writer pins (which steer the premium roster's rotation) cannot hold.
    const pinned: string[] = [];
    await runPractice(["debate", "--start-step", "free:3", "--answer-writer-model", HAIKU], {}, { log: (line) => pinned.push(line) });
    expect(pinned).toContain("practice could not run: PRACTICE_FLAG_VALUE_INVALID: --start-step (a free start takes no writer pin: pins hold only on premium)");
  });
});

describe("Task 91b: Step 4's --shape-policy file keeps its startStep", () => {
  it("a made-up file holding startStep and premium as the Plus row is read with startStep kept", () => {
    const read = () => JSON.stringify(STEP_ROW);
    const override = practiceShapeOverrideFromArgs("debate", new Map([["--shape-policy", "/made/up/start-step-shape.json"]]), read);
    expect(override?.policy?.startStep).toEqual(debateShapeStartStepStartValues());
    expect(override?.policy?.plans.premium).toEqual(override?.policy?.plans.plus);
    expect(debateShapeStartStepOf(override!.policy, "free")).toEqual({ options: [3], default: 3 });
    expect(debateShapeStartStepOf(override!.policy, "premium")).toEqual({ options: [3, 5, 7], default: 5 });
  });

  it("Step 4's file is the export's own newest row (its lean Free row kept), the start step added, premium given the Plus sizes", () => {
    const start = debateShapePolicyStartValues();
    // A made-up lean Free row in the export's newest version (the release's own), and an older version's row that is not read.
    const lean = { ...start, plans: { ...start.plans, free: { ...start.plans.free, mapAIs: 2, answers: 2 } } };
    const exported = (rows: readonly { version: string; value: unknown }[]) => parsePracticeRegisterExport(JSON.stringify({
      schema: "preview-practice-register-export-v1",
      versions: ["4", "5"].map((version) => ({ register_version: version, row_count: 1, base_register_version: null, publication_id: null,
        request_sha256: null, snapshot_sha256: null, publication_kind: null, recorded_at: null })),
      rows: rows.map((row) => ({ register_version: row.version, row_key: "debateShapePolicy", value_json: JSON.stringify(row.value), source_ref: "live" }))
    }));
    const policy = practiceStartShapePolicyOf(exported([{ version: "4", value: start }, { version: "5", value: lean }]));
    expect(policy.plans.free).toEqual(lean.plans.free);
    expect(policy.plans.premium).toEqual(lean.plans.plus);
    expect(policy.startStep).toEqual(debateShapeStartStepStartValues());
    // It reads back through --shape-policy exactly as written.
    expect(practiceShapeOverrideFromArgs("debate", new Map([["--shape-policy", "/made/up"]]), () => JSON.stringify(policy))?.policy).toEqual(policy);
    // An export whose newest version holds no row: refused, nothing written.
    expect(() => practiceStartShapePolicyOf(exported([{ version: "4", value: start }]))).toThrow(/PRACTICE_START_SHAPE_ROW_MISSING/u);
  });
});

describe("Task 91b: the practice composes the step before Start as main.ts does (drift guard)", () => {
  const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
  const API_MAIN = read("apps/api/src/main.ts");
  const PRACTICE_ASK = read("tools/preview-practice/practice-ask-composition.ts");
  const flat = (source: string) => withoutComments(source).replace(/\s+/gu, " ");

  it("the same createStartStep and createStartCharges members, a per-process key, and the step and its key handed out", () => {
    for (const anchor of ["const startStep = createStartStep({", "charges: createStartCharges({"]) {
      expect([...objectAfter(PRACTICE_ASK, anchor)].sort(), anchor).toEqual([...objectAfter(API_MAIN, anchor)].sort());
    }
    expect(flat(API_MAIN)).toContain("const startStepRoute = startStepRouteOf({ previewGate, writerPresent: preStartWriter });");
    expect(flat(PRACTICE_ASK)).toContain("const startStepRoute = startStepRouteOf({ previewGate, writerPresent: preStartWriter });");
    expect(flat(PRACTICE_ASK)).toContain("const startStepKey = newStartStepKey();");
    for (const source of [API_MAIN, PRACTICE_ASK]) {
      expect(flat(source)).toContain("settingsFor: (version) => admissionCache.admissionSettingsFor(version),");
      expect(flat(source)).toContain("record: (entry) => recordPreStartCharge(pool, entry),");
      expect(flat(source)).toContain("previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target))");
      expect(flat(source)).toContain("createStartTransport({ fetch: previewFetch, targets: declaredProviderTargets })");
    }
    const handedOut = flat(PRACTICE_ASK).slice(flat(PRACTICE_ASK).lastIndexOf("return Object.freeze({ application,"));
    expect(handedOut).toMatch(/\bstartStep\b/u);
    expect(handedOut).toMatch(/\bstartStepKey\b/u);
    expect(handedOut).toMatch(/\bstartView\b/u);
  });
});

describe("Task 91b: the month's phases", () => {
  it("each call of a debate goes to its phase: the paths' answers so far, the main answer and the story end the debate", () => {
    for (const key of ["PATH_OUTCOME:WRITER:1:1", "PATH_OUTCOME:CHECKER:3:1", "COMPOSER:SYNTHESIZER:main", "POST_COMPOSE_R9:EVALUATOR:main",
      "STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:CHARTS:1", "REPAIR:STRUCTURE:PATH_OUTCOME:WRITER:2:1"]) {
      expect(practiceStartPhaseOf(key, false), key).toBe("END_OF_DEBATE");
      expect(practiceStartPhaseOf(key, true), key).toBe("DIG");
    }
    for (const key of ["MAP:angles", "MAP:gap-paths:1", "PANEL:a", "JUDGE:review:b", "WEB:read1:0:1", "REPAIR:STRUCTURE:PANEL:a"]) {
      expect(practiceStartPhaseOf(key, false), key).toBe("DEBATE");
    }
  });

  it("one line per phase: before Start (no run), the debate, its end, and one per dig; calls are counted, a search fee is money only", () => {
    const lines = practiceStartMonthLines({ parentRunId: "p", digRunIds: ["d1"], charges: [
      { phase: "PRE_START", runId: null, costNanoUsd: 3n, call: true }, { phase: "PRE_START", runId: null, costNanoUsd: 4n, call: true },
      { phase: "DEBATE", runId: "p", costNanoUsd: 10n, call: true }, { phase: "DEBATE", runId: "p", costNanoUsd: 1000n, call: false },
      { phase: "END_OF_DEBATE", runId: "p", costNanoUsd: 20n, call: true }, { phase: "DIG", runId: "d1", costNanoUsd: 5n, call: true }] });
    expect(lines).toEqual([
      { kind: "START_MONTH", phase: "PRE_START", runId: null, calls: 2, costNanoUsd: "7" },
      { kind: "START_MONTH", phase: "DEBATE", runId: "p", calls: 1, costNanoUsd: "1010" },
      { kind: "START_MONTH", phase: "END_OF_DEBATE", runId: "p", calls: 1, costNanoUsd: "20" },
      { kind: "START_MONTH", phase: "DIG", runId: "d1", calls: 1, costNanoUsd: "5" }
    ]);
    // No debate admitted: the calls before Start alone.
    expect(practiceStartMonthLines({ parentRunId: null, digRunIds: [], charges: [{ phase: "PRE_START", runId: null, costNanoUsd: 3n, call: true }] }))
      .toEqual([{ kind: "START_MONTH", phase: "PRE_START", runId: null, calls: 1, costNanoUsd: "3" }]);
  });

  it("how far apart the paths filled in: each path's last accepted answer-so-far writer, first to last (Task 54's re-read)", () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 5, 9, 0, seconds));
    expect(practicePathFillSpread([
      { callSiteKey: "PATH_OUTCOME:WRITER:1:1", outcome: "OK", finishedAt: at(10) },
      { callSiteKey: "PATH_OUTCOME:WRITER:2:1", outcome: "FAILED", finishedAt: at(5) },
      { callSiteKey: "PATH_OUTCOME:WRITER:2:1", outcome: "OK", finishedAt: at(31) },
      { callSiteKey: "PATH_OUTCOME:WRITER:3:1", outcome: "OK", finishedAt: at(22) },
      { callSiteKey: "PATH_OUTCOME:CHECKER:3:1", outcome: "OK", finishedAt: at(50) }
    ])).toEqual({ paths: 3, spreadSeconds: 21 });
    expect(practicePathFillSpread([])).toBeNull();
  });
});

describe("Task 91b: a dry run on fake gates (Free, 3 paths, 1 dig)", () => {
  let out: string;
  beforeEach(() => { out = mkdtempSync(join(tmpdir(), "practice-start-month-")); });
  afterEach(() => { rmSync(out, { recursive: true, force: true }); });

  const parentRows = (runId: string): readonly LedgerRow[] => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 5, 9, 0, seconds));
    return [
      { runId, callSiteKey: "MAP:angles", actorRef: refOf(HAIKU), finishedAt: at(1), metadata: usage(1200, 300) },
      { runId, callSiteKey: "PANEL:a", actorRef: refOf(GLM), finishedAt: at(2), metadata: usage(2400, 800) },
      ...[1, 2, 3].map((pathNo) => ({ runId, callSiteKey: `PATH_OUTCOME:WRITER:${String(pathNo)}:1`, actorRef: refOf(HAIKU),
        finishedAt: at(10 + pathNo * 4), metadata: usage(3000, 500) })),
      { runId, callSiteKey: "PATH_OUTCOME:CHECKER:1:1", actorRef: refOf(GLM), finishedAt: at(30), metadata: usage(1500, 200) },
      { runId, callSiteKey: "COMPOSER:SYNTHESIZER:main", actorRef: refOf(HAIKU), finishedAt: at(40), metadata: usage(9000, 2000) },
      { runId, callSiteKey: "STORY:STORYTELLER:1", actorRef: refOf(HAIKU), finishedAt: at(50), metadata: usage(9000, 4000) }
    ];
  };
  const digRows = (runId: string): readonly LedgerRow[] => [
    { runId, callSiteKey: "MAP:list:1", actorRef: refOf(GLM), finishedAt: new Date(Date.UTC(2026, 10, 5, 9, 5, 0)), metadata: usage(1000, 400) },
    { runId, callSiteKey: "PATH_OUTCOME:WRITER:1:1", actorRef: refOf(HAIKU), finishedAt: new Date(Date.UTC(2026, 10, 5, 9, 5, 9)), metadata: usage(2000, 300) }
  ];

  function compose() {
    const key = newStartStepKey();
    const chosen = new Set(NUCLEAR_MENU.paths.slice(0, 3).flatMap((path) => path.viewpoint_ids));
    const answers = new Map<string, Answer>();
    seen.composed = { startStep: fakeStep(key, NUCLEAR_MENU), startStepKey: key, answers,
      startView: { registerVersion: 6, debateShapePolicy: STEP_ROW, engineVersionPolicy: engineVersionPolicyStartValues(), modelScorecardInForce: false } };
    // The debate's served answer: its "+ N more to explore" (the menu paths none of whose viewpoints was chosen).
    const parentRunId = `${"1".padStart(8, "0")}-1111-4111-8111-111111111111`;
    answers.set(parentRunId, { branches: { more: startMoreOf(NUCLEAR_MENU, chosen) } } as unknown as Answer);
    seen.writes.push(parentRows, digRows);
    return { parentRunId };
  }

  it("asks the lists, merges, combines once, starts the top 3 paths, digs the more items, and writes the month's lines to --out only", async () => {
    const { parentRunId } = compose();
    const progress: string[] = [];
    const result = await runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
      depth: 1, questionId: "en", shape: { policy: STEP_ROW, ask: {} }, start: { plan: "free", paths: 3, digs: 1 }, startMonthDirectory: out,
      progress: (line) => progress.push(line) } as Parameters<typeof runPracticeDebate>[0]);

    // The debate: Free, the menu's top 3 paths in the AIs' words (MENU, chosen by the AIs), the check of Next and its hand-over.
    expect(seen.submits).toHaveLength(2);
    const [debate, dig] = seen.submits as [typeof seen.submits[number], typeof seen.submits[number]];
    expect(debate.request).toMatchObject({ plan_tier: "free", composition_budget_tier: "low",
      start_check: { ref: expect.any(String) }, start_paths: { source: "MENU", width: 3, chosen_by: "AIS" } });
    expect((debate.request.start_paths as { paths: { title: string }[] }).paths.map((path) => path.title))
      .toEqual(NUCLEAR_MENU.paths.slice(0, 3).map((path) => path.title));
    expect(debate.handOver).toMatchObject({ binding: { planKey: "free", settingsVersion: 6 }, verified: { source: "MENU", chosenBy: "AIS" } });
    // The dig: the debate's more items first, up to 3 picks, each its own path (DIG_PICKS), joined and its picks kept.
    expect(dig.request).toMatchObject({ plan_tier: "free", parent: { parent_run_id: parentRunId, mode: "quick",
      places: ["more-kp04", "more-kp05", "more-kp06"] } });
    expect((dig.request.parent as { picks: { kind: string; suggestion_id: string }[] }).picks.map((pick) => [pick.kind, pick.suggestion_id]))
      .toEqual([["HELPS_MAIN_QUESTION", "more-kp04"], ["HELPS_MAIN_QUESTION", "more-kp05"], ["HELPS_MAIN_QUESTION", "more-kp06"]]);
    expect(dig.request).not.toHaveProperty("start_paths");
    expect(dig.handOver).toMatchObject({ verified: { source: "DIG_PICKS", paths: [{ author: "AI_SUGGESTION" }, { author: "AI_SUGGESTION" },
      { author: "AI_SUGGESTION" }] } });
    expect(seen.digJoins).toHaveLength(1);
    expect(seen.digPicks).toHaveLength(1);

    // The month: the lines in --out add up to the ledger rows (the 0158 rows before Start, each run's model calls).
    const fileLines = readFileSync(join(out, PRACTICE_START_MONTH_FILE), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(fileLines[0]).toEqual({ kind: "START_MONTH_RUN", plan: "free", paths: 3, digs: 1, questionId: "en" });
    const lines = fileLines.slice(1) as unknown as PracticeStartMonthLine[];
    const digRunId = `${"2".padStart(8, "0")}-1111-4111-8111-111111111111`;
    expect(lines.map((line) => [line.phase, line.runId])).toEqual([["PRE_START", null], ["DEBATE", parentRunId], ["END_OF_DEBATE", parentRunId],
      ["DIG", digRunId]]);
    expect(lines[3]!.calls).toBe(seen.ledger.filter((row) => row.runId === digRunId).length);
    expect(result.startMonth).toEqual(lines);
    expect(lines.reduce((sum, line) => sum + line.calls, 0)).toBe(seen.preStart.length + seen.ledger.length);
    expect(lines[0]!.calls).toBe(5);
    expect(lines[2]!.calls).toBe(6);
    const priced = (rows: readonly LedgerRow[]) => rows.reduce((sum, row) => sum + practiceCallCostNanoUsd(PREVIEW_PROVIDER_REF_MODELS[row.actorRef]!,
      row.metadata), 0n);
    expect(lines.reduce((sum, line) => sum + BigInt(line.costNanoUsd), 0n))
      .toBe(seen.preStart.reduce((sum, micros) => sum + BigInt(micros) * 1000n, 0n) + priced(seen.ledger));
    expect(BigInt(lines[2]!.costNanoUsd)).toBe(priced(seen.ledger.filter((row) => row.runId === parentRunId
      && /^(PATH_OUTCOME|COMPOSER|STORY):/u.test(row.callSiteKey))));
    // Figures only in --out: no money figure in the progress lines.
    for (const line of lines) {
      if (line.costNanoUsd !== "0") expect(progress.join("\n")).not.toContain(line.costNanoUsd);
    }
    expect(progress.join("\n")).not.toMatch(/nano|micros|\$|¢/iu);
    expect(progress).toContain(`start month: ${String(lines.length)} lines in ${join(out, PRACTICE_START_MONTH_FILE)}`);
    // Task 54's re-read: how far apart the paths filled in (seconds, no money).
    expect(progress).toContain("paths filled in: 3 paths, the first to the last 8 s apart");
  });

  it("the month file is appended to: Step 4's three runs share one --out folder", async () => {
    compose();
    await runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
      depth: 1, questionId: "en", shape: { policy: STEP_ROW, ask: {} }, start: { plan: "free", paths: 3, digs: 0 }, startMonthDirectory: out,
      progress: () => undefined } as Parameters<typeof runPracticeDebate>[0]);
    const first = readFileSync(join(out, PRACTICE_START_MONTH_FILE), "utf8").trim().split("\n");
    seen.submits.length = 0; seen.workItems.clear(); seen.ran = 0; seen.writes.length = 0;
    compose();
    await runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
      depth: 1, questionId: "en", shape: { policy: STEP_ROW, ask: {} }, start: { plan: "free", paths: 3, digs: 0 }, startMonthDirectory: out,
      progress: () => undefined } as Parameters<typeof runPracticeDebate>[0]);
    const both = readFileSync(join(out, PRACTICE_START_MONTH_FILE), "utf8").trim().split("\n");
    expect(both.slice(0, first.length)).toEqual(first);
    expect(both.filter((line) => line.includes("START_MONTH_RUN"))).toHaveLength(2);
  });

  it("a version whose row has no start step is refused before any AI is asked", async () => {
    compose();
    (seen.composed as { startView: unknown }).startView = { registerVersion: 6, debateShapePolicy: debateShapePolicyStartValues(),
      engineVersionPolicy: engineVersionPolicyStartValues(), modelScorecardInForce: false };
    await expect(runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
      depth: 1, questionId: "en", shape: { policy: debateShapePolicyStartValues(), ask: {} }, start: { plan: "free", paths: 3, digs: 0 },
      startMonthDirectory: out, progress: () => undefined } as Parameters<typeof runPracticeDebate>[0]))
      .rejects.toMatchObject({ code: "PRACTICE_START_STEP_NOT_IN_FORCE" });
    expect(seen.preStart).toEqual([]);
    expect(seen.submits).toEqual([]);
  });

  /*
   * Task 91e (the 91d review): every start-step practice ended NOT_PROVEN when nothing was wrong. The sat-out list was the premium
   * roster less the panel, but a Free start seats only the Free roster; and the shape facts read a v2 receipt's `shape`, which it never
   * has (`shapeV2`). Rules: a model the plan does not seat is never "not exercised"; one it seats that the panel left out still is; an
   * R22 practice (no --start-step) keeps today's premium roster. Made-up panels, receipts and answers on the stand-ins above.
   */
  describe("Task 91e: a start-step run that went right proves PASS", () => {
    const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
    const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
    const QWEN = "Qwen/Qwen3.8-Flash";
    const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
      maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
      reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
    const S = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
    const member = (model: string) => ({ provider_ref: refOf(model), model_id: model, maker: model.split(/[-/]/u)[0]!.toLowerCase() });
    /** The run as the practice reads it after the debate: its panel, its v2 receipt, its stored set of MENU paths and a served answer. */
    const debated = (plan: "free" | "premium", paths: number, panel: readonly string[]) => {
      seen.panel.push(...panel.map(member));
      // A v2 receipt needs a panel of 2 at least (admission's own rule); a panel the test cuts to one keeps a receipt of two.
      const makers = Math.max(2, panel.length);
      seen.basis = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, panelSize: makers, depth: 1,
        shapeV2: resolveDebateShapeV2(STEP_ROW, plan, { ...S, paths, pathsSource: "MENU" }, makers) })));
      seen.pathSet.push(...Array.from({ length: paths }, () => ({ source: "MENU", author: "AI_SUGGESTION" })));
      seen.projection = { terminal: "SERVED", serve_state: "SERVED", verdict_state: "SETTLED", condition_mark_records: [] };
      seen.story = { outcome: "READY", failureCode: null };
    };
    const practise = (start: { plan: "free" | "premium"; paths: number; digs: 0 } | undefined) => runPracticeDebate({ settings: SETTINGS,
      sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never, depth: 1, questionId: "en",
      shape: { policy: STEP_ROW, ask: {} }, ...(start === undefined ? {} : { start, startMonthDirectory: out }),
      progress: () => undefined } as Parameters<typeof runPracticeDebate>[0]);
    const reportOf = (result: Awaited<ReturnType<typeof runPracticeDebate>>) =>
      debateReport({ result, observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1_000) });

    it("Free (free:3): the Free roster seated, none of the premium-only models named, the shape block from shapeV2: PASS", async () => {
      compose();
      debated("free", 3, [GLM, HAIKU]);
      const result = await practise({ plan: "free", paths: 3, digs: 0 });
      expect(result.admission.satOut).toEqual([]);
      expect(result.shape).toMatchObject({ sizes: { version: 2, plan: "free", paths: 3, pathsSource: "MENU", gapRounds: 0 }, notExercised: null });
      expect(reportOf(result)).toMatchObject({ verdict: "PASS", exitCode: 0, reasons: [] });
    });

    it("premium:5 the same: the premium roster seated, 5 paths on the receipt: PASS", async () => {
      compose();
      debated("premium", 5, [GLM, DEEPSEEK, MIMO, QWEN, HAIKU]);
      const result = await practise({ plan: "premium", paths: 5, digs: 0 });
      expect(seen.submits[0]!.request).toMatchObject({ plan_tier: "premium", start_paths: { source: "MENU", width: 5 } });
      expect(result.admission.satOut).toEqual([]);
      expect(result.shape).toMatchObject({ sizes: { version: 2, plan: "premium", paths: 5, pathsSource: "MENU" }, notExercised: null });
      expect(reportOf(result)).toMatchObject({ verdict: "PASS", exitCode: 0, reasons: [] });
    });

    it("a model the plan seats that the panel left out was never called: still NOT_PROVEN, naming it alone", async () => {
      compose();
      debated("free", 3, [GLM]);
      const free = await practise({ plan: "free", paths: 3, digs: 0 });
      expect(free.admission.satOut.map((entry) => entry.model)).toEqual([HAIKU]);
      expect(reportOf(free)).toMatchObject({ verdict: "NOT_PROVEN", exitCode: 30, reasons: [`MODEL_NOT_EXERCISED:${HAIKU}`] });
    });

    // Task 91e review: the same rule on premium:5 (the sitting's Plus run). Its roster is the premium one, never the Free one: a
    // premium-only model the panel left out (Qwen here, outside the made-up Free roster) is still named.
    it("premium:5 the same rule: a premium-roster model the panel left out is still NOT_PROVEN, naming it alone", async () => {
      compose();
      debated("premium", 5, [GLM, DEEPSEEK, MIMO, HAIKU]);
      const plus = await practise({ plan: "premium", paths: 5, digs: 0 });
      expect(plus.admission.satOut.map((entry) => entry.model)).toEqual([QWEN]);
      expect(reportOf(plus)).toMatchObject({ verdict: "NOT_PROVEN", exitCode: 30, reasons: [`MODEL_NOT_EXERCISED:${QWEN}`] });
    });

    it("an R22 practice (no --start-step) asks on premium as today: its sat-out list is the premium roster less the panel", async () => {
      compose();
      seen.panel.push(...[GLM, DEEPSEEK, HAIKU].map(member));
      const result = await practise(undefined);
      expect(seen.submits[0]!.request).toMatchObject({ plan_tier: "premium" });
      expect(result.admission.satOut.map((entry) => entry.model)).toEqual([MIMO, QWEN]);
      expect(reportOf(result).reasons).toEqual(expect.arrayContaining([`MODEL_NOT_EXERCISED:${MIMO}`, `MODEL_NOT_EXERCISED:${QWEN}`]));
    });
  });

  /*
   * Task 91f (owner 9 Nov, "Fix the practice first"): the practice asks with billing kept off, so the site's plan read finds no plan for
   * its runs and the web step searched nothing, even on premium:5. The runner composition is handed the plan billing would have pinned:
   * PLUS for premium, FREE for free; a practice without --start-step hands none (today's runner, byte for byte).
   */
  describe("Task 91f: the plan the practice's runner is handed for its web step", () => {
    const handed = () => vi.mocked(composePracticeRunner).mock.calls.map((call) => (call[0] as { webPlan?: unknown }).webPlan);
    const practise = (start: { plan: "free" | "premium"; paths: number; digs: 0 } | undefined) => runPracticeDebate({ settings: SETTINGS,
      sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never, depth: 1, questionId: "en",
      shape: { policy: STEP_ROW, ask: {} }, ...(start === undefined ? {} : { start, startMonthDirectory: out }),
      progress: () => undefined } as Parameters<typeof runPracticeDebate>[0]);
    beforeEach(() => { vi.mocked(composePracticeRunner).mockClear(); });

    it("premium:5 is PLUS, free:3 is FREE, no --start-step none", async () => {
      compose();
      await practise({ plan: "premium", paths: 5, digs: 0 });
      compose();
      await practise({ plan: "free", paths: 3, digs: 0 });
      compose();
      await practise(undefined);
      expect(handed()).toEqual(["PLUS", "FREE", undefined]);
      expect(vi.mocked(composePracticeRunner).mock.calls[2]![0]).not.toHaveProperty("webPlan");
    });
  });
});
