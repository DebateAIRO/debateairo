// The preview practice's debate-shape support (plan 2026-10-12-debate-shape-phase2d, Task 2; Task 1's notes (a), (b)):
// runPracticeDebate really receives `shape`. The three ask settings reach the request the ask path is handed
// (depth_params), the ask path and the runner both read the version that carries the row (the practice's own, or the
// code's next with --register-next), and a comparison question id is asked. The throwaway database, the register
// import and the two compositions are stand-ins here (nothing is started, nothing is sent); the integration suite
// (tests/integration/preview-practice-run.test.ts) runs the real ones.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyStartValues, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  type DebateShapePolicy
} from "@debateai/register";
import { TypedDomainError } from "@debateai/kernel";
import { runPracticeDebate } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { practiceLengthBlockLines } from "../../tools/preview-practice/practice-length.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { PRACTICE_LANGUAGE_CASES } from "../../tools/preview-practice/practice-questions.js";
import { debateReport, reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { parsePracticeRegisterExport, type PracticeRegisterImportReceipt } from "../../tools/preview-practice/practice-register-import.js";
import type { PracticeSettings, PracticeSockets } from "../../tools/preview-practice/practice-settings.js";

const seen = vi.hoisted(() => ({
  /** Register versions present in the stand-in database (the exactness check reads them). */
  versions: new Set<string>(),
  /** The row the stand-in register holds, by version. */
  rows: new Map<number, unknown>(),
  /** The length row the stand-in register holds, by version (LG-C). */
  lengthRows: new Map<number, unknown>(),
  receipt: null as unknown,
  published: [] as unknown[][],
  readVersions: [] as number[],
  askVersions: [] as number[],
  runnerVersions: [] as number[],
  /** The release key each composition was handed (side-by-side §1, §3: one key, at the version it reads). */
  askKeys: [] as string[],
  runnerKeys: [] as string[],
  requests: [] as Record<string, unknown>[],
  /** When set, the stand-in ask refuses the request with it (an admission refusal). */
  submitError: null as Error | null
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/db")>(),
  migrate: vi.fn(async () => undefined),
  configureContentEncryption: vi.fn()
}));
vi.mock("@debateai/register", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/register")>(),
  readDebateShapePolicy: vi.fn(async (_pool: unknown, version: number) => {
    seen.readVersions.push(version);
    return seen.rows.get(version) ?? null;
  }),
  readLengthGuidancePolicy: vi.fn(async (_pool: unknown, version: number) => seen.lengthRows.get(version) ?? null)
}));
vi.mock("../../tools/preview-practice/practice-throwaway-db.js", () => ({
  startPracticeDatabase: vi.fn(async () => {
    const pool = {
      query: async (text: string, params?: unknown[]) => ({
        rows: text.includes("FROM register.register_version") && seen.versions.has(String(params?.[0])) ? [{ "?column?": 1 }] : []
      })
    };
    return { pool, databaseName: "debateai_practice_00000000", extraPool: () => pool, stop: async () => undefined };
  })
}));
vi.mock("../../tools/preview-practice/practice-register-import.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../tools/preview-practice/practice-register-import.js")>(),
  importPracticeRegister: vi.fn(async () => seen.receipt),
  publishPracticeOverrideVersion: vi.fn(async (...args: unknown[]) => {
    seen.published.push(args);
    const overrides = args[3] as { shape: unknown; length: unknown };
    seen.rows.set(6, overrides.shape);
    seen.lengthRows.set(6, overrides.length);
    return { baseRegisterVersion: "5", registerVersion: "6", shapeRow: overrides.shape === null ? null : "ADDED",
      lengthRow: overrides.length === null ? null : "ADDED", snapshotSha256: "a".repeat(64) };
  })
}));
vi.mock("../../tools/preview-practice/practice-ask-composition.js", () => ({
  practiceRemainingPorts: () => ({ deepinfra: async () => { throw new Error("no gate"); }, anthropic: async () => { throw new Error("no gate"); } }),
  composePracticeAsk: vi.fn(async (input: { settings: PracticeSettings }) => {
    seen.askVersions.push(input.settings.runner.REGISTER_VERSION);
    seen.askKeys.push(input.settings.runner.RELEASE_KEY);
    // Admits nothing: the debate ends as an ask that was not dispatched, after the request was handed over.
    // Local mode, as the real composition returns it (hosted: null); submit answers QUEUED as the real ask does.
    return { application: { submit: async (request: Record<string, unknown>) => {
      seen.requests.push(request);
      if (seen.submitError !== null) throw seen.submitError;
      return { status: "QUEUED" };
    } },
      hosted: null };
  })
}));
vi.mock("../../tools/preview-practice/practice-runner-composition.js", () => ({
  composePracticeRunner: vi.fn(async (input: { environment: { REGISTER_VERSION: number; RELEASE_KEY: string } }) => {
    seen.runnerVersions.push(input.environment.REGISTER_VERSION);
    seen.runnerKeys.push(input.environment.RELEASE_KEY);
    return { runner: {}, callStats: { summary: () => ({}) }, money: null };
  })
}));

/** An export whose newest (live) version is 5; its rows do not matter here (the import is a stand-in). */
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
const SETTINGS = { runner: { REGISTER_VERSION: 5, RELEASE_KEY: "r5-d50e33165a1b" }, previewConfig: { premium_model_ids: [] } } as unknown as PracticeSettings;
const SOCKETS = { deepinfra: "/nowhere/deepinfra.sock", anthropic: "/nowhere/anthropic.sock" } as PracticeSockets;
const ASK = Object.freeze({ depthMode: "fixed", scrutiny: "deep", answerLength: "short" } as const);
const LIVE: PracticeRegisterImportReceipt = Object.freeze({ registerVersion: "5", steps: [] });
const codeNext = (addedKeys: readonly string[], changedKeys: readonly string[] = []): PracticeRegisterImportReceipt => Object.freeze({
  registerVersion: "6", steps: [], codeNext: { baseRegisterVersion: "5", addedKeys, changedKeys, deltaSha256: "b".repeat(64) } });

function debate(extra: Readonly<Record<string, unknown>>) {
  return runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
    depth: 1, questionId: "ro-euro", ...extra } as Parameters<typeof runPracticeDebate>[0]);
}

beforeEach(() => {
  seen.versions = new Set(["4", "5"]);
  seen.rows.clear();
  seen.lengthRows.clear();
  seen.receipt = LIVE;
  seen.submitError = null;
  for (const list of [seen.published, seen.readVersions, seen.askVersions, seen.runnerVersions, seen.requests, seen.askKeys, seen.runnerKeys]) {
    list.length = 0;
  }
});

describe("practice debate shape: runPracticeDebate receives the shape (Task 1's notes)", () => {
  it("--shape-policy without --register-next: the practice's own version (6) is published, both compositions read it, the ask carries the three settings", async () => {
    const policy: DebateShapePolicy = debateShapePolicyStartValues();
    const result = await debate({ shape: { policy, ask: ASK } });
    expect(seen.published).toHaveLength(1);
    expect(seen.published[0]![1]).toBe(REGISTER);
    expect(seen.published[0]![2]).toBe(LIVE);
    expect(seen.published[0]![3]).toEqual({ shape: policy, length: null });
    expect([seen.readVersions, seen.askVersions, seen.runnerVersions]).toEqual([[6], [6], [6]]);
    // Side-by-side §1, §3: both compositions get the ONE key, renumbered to the version they read (same code part).
    expect([seen.askKeys, seen.runnerKeys]).toEqual([["r6-d50e33165a1b"], ["r6-d50e33165a1b"]]);
    expect(seen.requests).toHaveLength(1);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
    // Task 1's note (b): a comparison question id is asked, word for word.
    expect(seen.requests[0]!.question_line).toBe(OPENINGS_QUESTIONS.find((question) => question.id === "ro-euro")!.questionLine);
    expect(result.questionId).toBe("ro-euro");
    expect(result.admission).toMatchObject({ admitted: false, refusalCode: "NOT_DISPATCHED" });
    // Final review M-2: report.json's register block names the version the debate ran on (as shape.registerVersion and
    // the transcript do), with the imported newest (live) version kept under its own name.
    expect(result.register).toEqual({ registerVersion: "6", importedRegisterVersion: "5", steps: [] });
    expect(result.shape?.registerVersion).toBe("6");
  });

  it("--shape-policy with --register-next: nothing more is published; the code's next version (6), which carries the row, is read", async () => {
    seen.receipt = codeNext([DEBATE_SHAPE_POLICY_ROW_KEY]);
    seen.versions.add("6");
    seen.rows.set(6, debateShapePolicyStartValues());
    const result = await debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: ASK } });
    expect(seen.published).toEqual([]);
    expect([seen.readVersions, seen.askVersions, seen.runnerVersions]).toEqual([[6], [6], [6]]);
    expect([seen.askKeys, seen.runnerKeys]).toEqual([["r6-d50e33165a1b"], ["r6-d50e33165a1b"]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
    // The import's receipt already names the code's next version: it is reported as it is (M-2).
    expect(result.register).toBe(seen.receipt);
    expect(result.shape?.registerVersion).toBe("6");
  });

  it("--shape-policy with --register-next: shape.row says what the code's next version did to the row: ADDED, REPLACED or UNCHANGED (final review M-3)", async () => {
    const rowOf = async (receipt: PracticeRegisterImportReceipt) => {
      seen.receipt = receipt;
      seen.versions.add("6");
      seen.rows.set(6, debateShapePolicyStartValues());
      return (await debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: {} } })).shape?.row;
    };
    expect(await rowOf(codeNext([DEBATE_SHAPE_POLICY_ROW_KEY]))).toBe("ADDED");
    expect(await rowOf(codeNext(["judgeContractHash"], [DEBATE_SHAPE_POLICY_ROW_KEY]))).toBe("REPLACED");
    // The export already held a row with the same bytes (value and source ref): the key is in neither list.
    expect(await rowOf(codeNext(["judgeContractHash"]))).toBe("UNCHANGED");
    expect(seen.published).toEqual([]);
  });

  it("a language case asked by id is asked on the case's own site, unless --site-language says otherwise (final review M-6)", async () => {
    const sites: unknown[] = [];
    for (const language of [undefined, { siteLanguage: null, choice: "keep" }, { siteLanguage: "en", choice: "keep" }]) {
      seen.requests.length = 0;
      await debate({ questionId: "lang-sr-latn", shape: { policy: debateShapePolicyStartValues(), ask: {} },
        ...(language === undefined ? {} : { language }) });
      expect(seen.requests[0]!.question_line).toBe(PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-sr-latn")!.questionLine);
      sites.push(seen.requests[0]!.site_language);
    }
    // lang-sr-latn is asked on the Romanian site (the case table), as language mode asks it.
    expect(sites).toEqual(["ro", "ro", "en"]);
    // Any other question keeps the question's own language as its default site.
    seen.requests.length = 0;
    await debate({ questionId: "en-nuclear", shape: { policy: debateShapePolicyStartValues(), ask: {} } });
    expect(seen.requests[0]!.site_language).toBe("en");
  });

  it("no shape: today's debate (the live version, depth only, nothing published)", async () => {
    const result = await debate({});
    // Row absent: report.json's register block stays today's receipt, byte for byte (M-2).
    expect(result.register).toBe(LIVE);
    expect(seen.published).toEqual([]);
    expect([seen.askVersions, seen.runnerVersions]).toEqual([[5], [5]]);
    expect([seen.askKeys, seen.runnerKeys]).toEqual([["r5-d50e33165a1b"], ["r5-d50e33165a1b"]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1 });
  });

  it("the ask settings alone on a register that holds its own row: the ask carries them on the live version", async () => {
    seen.rows.set(5, debateShapePolicyStartValues());
    await debate({ shape: { policy: null, ask: { answerLength: "detailed" } } });
    expect(seen.published).toEqual([]);
    expect([seen.askVersions, seen.runnerVersions]).toEqual([[5], [5]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, answerLength: "detailed" });
  });

  it("the ask settings without a row in force (none, or switched off) are refused before the ask is composed", async () => {
    await expect(debate({ shape: { policy: null, ask: { scrutiny: "deep" } } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW" });
    seen.rows.set(5, { ...debateShapePolicyStartValues(), enabled: false });
    await expect(debate({ shape: { policy: null, ask: { scrutiny: "deep" } } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW" });
    expect([seen.askVersions, seen.requests]).toEqual([[], []]);
  });

  it("--length-policy, the ask not dispatched: the result and report.json still carry the length block, with no frozen numbers (fix round 1, Minor 5)", async () => {
    const result = await debate({ length: lengthGuidancePolicyStartValues(), shape: { policy: null, ask: { answerLength: "detailed" } } });
    expect(result.admission).toMatchObject({ admitted: false, refusalCode: "NOT_DISPATCHED" });
    expect(seen.published[0]![3]).toEqual({ shape: null, length: lengthGuidancePolicyStartValues() });
    // --answer-length alone passes with the length row and no debate-shape row (LG-C).
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, answerLength: "detailed" });
    const block = { source: "FLAG", registerVersion: "6", row: "ADDED", frozen: null, unreadable: null };
    expect(result.length).toEqual(block);
    expect(result.shape).toBeUndefined();
    // The stand-in runner's call stats are empty ({}), which no report table reads; they are left out here.
    const report = debateReport({ result: { ...result, parallel: undefined } as never, observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1_000) });
    expect(report.length).toEqual(block);
    expect(reportMarkdown(report)).toContain(practiceLengthBlockLines(result.length!).join("\n"));
  });

  // Task 9 re-review: an ask the admission REFUSES keeps the length block too, with its own refusal code.
  it("--length-policy, the ask refused at admission: the result and report.json carry the length block and the refusal code", async () => {
    seen.submitError = new TypedDomainError("RUN_CEILING_BELOW_ONE_CALL", "refused for the test");
    const result = await debate({ length: lengthGuidancePolicyStartValues(), shape: { policy: null, ask: {} } });
    expect(seen.requests).toHaveLength(1);
    expect(result.admission).toMatchObject({ admitted: false, refusalCode: "RUN_CEILING_BELOW_ONE_CALL" });
    const block = { source: "FLAG", registerVersion: "6", row: "ADDED", frozen: null, unreadable: null };
    expect(result.length).toEqual(block);
    const report = debateReport({ result: { ...result, parallel: undefined } as never, observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1_000) });
    expect(report.length).toEqual(block);
  });

  // Task 20 review 1 (final wave B14): the engine row's read-back. A --register-next version composed without the engine
  // row would silently run engine 1: refused before the ask is composed or submitted.
  it("--engine-policy on a code's next version composed without it: PRACTICE_ENGINE_POLICY_NOT_PUBLISHED, nothing submitted", async () => {
    seen.receipt = codeNext([]);
    seen.versions.add("6");
    seen.lengthRows.set(6, lengthGuidancePolicyStartValues());
    await expect(debate({ registerNext: {} as never, length: lengthGuidancePolicyStartValues(), engine: engineVersionPolicyStartValues(),
      shape: { policy: null, ask: {} } })).rejects.toMatchObject({ code: "PRACTICE_ENGINE_POLICY_NOT_PUBLISHED" });
    expect([seen.askVersions, seen.requests]).toEqual([[], []]);
  });

  // Task 20 review 2 (final wave B14): the stand-in publisher leaves engineRow out; the progress loop reads it as untouched.
  it("a version without an engine change prints no engine line (the progress loop's `!= null`)", async () => {
    const lines: string[] = [];
    await debate({ length: lengthGuidancePolicyStartValues(), shape: { policy: null, ask: {} }, progress: (line: string) => lines.push(line) });
    expect(lines.some((line) => line.startsWith("the length row added"))).toBe(true);
    expect(lines.some((line) => line.startsWith("the engine row"))).toBe(false);
  });

  // Task 21 review 4 (final wave B15): report.json carries writerPins only for a run that pinned a writer; report.md its lines.
  it("debateReport with and without writerPins: the block and its lines only with a pin, and an unheld pin is NOT_PROVEN", async () => {
    const pinned = await debate({ pins: { answerWriter: "claude-haiku-5-5", storyteller: null }, shape: { policy: null, ask: {} } });
    expect(pinned.writerPins).toEqual({
      answerWriter: { pinnedModel: "claude-haiku-5-5", wroteModel: null, servedBy: [], held: false }, storyteller: null });
    const report = (result: typeof pinned) => debateReport({ result: { ...result, parallel: undefined } as never,
      observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1_000) });
    const withPins = report(pinned);
    expect(withPins.writerPins).toEqual(pinned.writerPins);
    expect(withPins.reasons).toContain("PRACTICE_PIN_NOT_HELD:ANSWER_WRITER");
    expect(reportMarkdown(withPins)).toContain("- answer writer: pinned claude-haiku-5-5, wrote none (no rotation was picked), served by none, held: no");
    const unpinned = await debate({ shape: { policy: null, ask: {} } });
    const without = report(unpinned);
    expect(Object.hasOwn(without, "writerPins")).toBe(false);
    expect(without.reasons.some((reason) => reason.startsWith("PRACTICE_PIN_NOT_HELD"))).toBe(false);
    expect(reportMarkdown(without)).not.toContain("Pinned final writers");
  });

  it("--shape-policy on a code's next version composed without it: refused before the ask is composed", async () => {
    seen.receipt = codeNext([]);
    seen.versions.add("6");
    await expect(debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: {} } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_POLICY_NOT_PUBLISHED" });
    expect(seen.askVersions).toEqual([]);
  });
});
